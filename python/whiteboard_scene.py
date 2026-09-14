"""CPU whiteboard adapter for whiteboard-animator 0.1.1 (Masih Sultani, MIT).

Uses the upstream pixel-reveal engine. Its encoder command builders are wrapped
here to mux narration/captions in the same encode and bound process threads.
No upstream source is modified. No optional Gemini feature is imported.
"""
import argparse
import importlib.metadata
import json
import math
import os
from pathlib import Path
import textwrap
import time


def settings():
    return max(1, min(8, int(os.environ.get('RENDER_THREADS', '2'))))


def readiness():
    try:
        import whiteboard_animator
        import onnxruntime
        from whiteboard_animator.craft_detector import CRAFT_MODEL_PATH
        return {'ready': True, 'version': importlib.metadata.version('whiteboard-animator'),
                'textModel': Path(CRAFT_MODEL_PATH).is_file(), 'maxDrawingDimension': 1280}
    except Exception as error:
        return {'ready': False, 'error': str(error)}


def font(size):
    from PIL import ImageFont
    configured = os.environ.get('WHITEBOARD_FONT', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    try:
        return ImageFont.truetype(configured, size)
    except OSError:
        return ImageFont.load_default(size=size)


def make_board(spec, width, height):
    from PIL import Image, ImageDraw, ImageOps
    if spec.get('image'):
        with Image.open(spec['image']) as source:
            source = source.convert('RGBA')
            white = Image.new('RGBA', source.size, 'white')
            source = Image.alpha_composite(white, source).convert('RGB')
            import numpy as np
            ink = np.mean(np.asarray(source.convert('L')) < 240)
            if ink > .60:
                raise ValueError('This image is too dense for whiteboard animation. Use clean ink on white, or choose the narrated-image format.')
            # Fit, don't crop diagram labels. White padding preserves the upstream ink model.
            return ImageOps.pad(source, (width, height), color='white', method=Image.Resampling.LANCZOS)
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    margin = int(width * .07)
    title_size = max(20, int(width / 32))
    body_size = max(18, int(width / 42))
    title_font, body_font = font(title_size), font(body_size)
    title_lines = textwrap.wrap(spec['title'], width=max(18, int((width - 2 * margin) / (title_size * .62))))[:3]
    y = int(height * .07)
    draw.text((margin, y), '\n'.join(title_lines), font=title_font, fill='#172554', spacing=7)
    y += (title_size + 7) * len(title_lines) + 28
    draw.line((margin, y, width - margin, y), fill='#0d9488', width=4)
    y += 30
    # These are exact excerpts, not invented diagrams or unverified visual facts.
    words = spec['text'].split()
    excerpt = ' '.join(words[:45])
    lines = textwrap.wrap(excerpt, width=max(20, int((width - 2 * margin - 36) / (body_size * .59))))
    maximum = max(2, int((height * .75 - y) / (body_size + 12)))
    if len(lines) > maximum:
        lines = lines[:maximum]
        lines[-1] = lines[-1].rstrip('.,;') + '…'
    draw.text((margin + 28, y), '\n'.join(lines), font=body_font, fill='#1e293b', spacing=12)
    draw.ellipse((margin, y + 8, margin + 10, y + 18), fill='#0d9488')
    draw.text((margin, int(height * .82)), f"SCENE {spec.get('scene', 1)}", font=font(max(14, body_size - 8)), fill='#64748b')
    return image


def render(spec):
    import numpy as np
    import cv2
    import onnxruntime as ort
    from whiteboard_animator import WhiteboardAnimator
    from whiteboard_animator import video_encoding
    from whiteboard_animator.craft_detector import CRAFT_MODEL_PATH

    started = time.monotonic()
    threads = settings()
    cv2.setNumThreads(threads)
    width, height = int(spec['width']), int(spec['height'])
    factor = min(1, 1280 / max(width, height))
    board_width = int(width * factor) // 2 * 2
    board_height = int(height * factor) // 2 * 2
    board = make_board(spec, board_width, board_height)
    array = np.asarray(board)
    ink_fraction = float(np.mean(np.min(array, axis=2) < 240))
    if ink_fraction < .0001:
        raise ValueError('Whiteboard image is blank. Add dark marker strokes on a white background.')
    if spec.get('image') and ink_fraction > .60:
        raise ValueError('This image is too dense for whiteboard animation. Use clean ink on white, or choose the narrated-image format.')
    board.save(spec['boardOutput'])
    total = float(spec['duration'])
    if not math.isfinite(total) or not 0 < total <= 300:
        raise ValueError('Whiteboard scene duration must be between 0 and 300 seconds.')
    # Finish drawing early and leave a readable hold. Duration is measured from TTS.
    draw_duration = max(.1, total * .70)
    class PacedAnimator(WhiteboardAnimator):
        schedule_scale = 1.0

        def _schedule_components(self, components, draw_duration, start=0.0):
            schedule = super()._schedule_components(components, draw_duration, start)
            # Upstream gives every tiny component at least 50 ms. Dense text can
            # therefore exceed the entire scene. Compress the complete schedule,
            # preserving component order, so every stroke fits before the hold.
            end = max((t + duration for _, t, duration in schedule), default=start)
            scale = min(1.0, draw_duration / max(end - start, .001))
            self.schedule_scale = min(self.schedule_scale, scale)
            return [(component, start + (t - start) * scale, duration * scale)
                    for component, t, duration in schedule]

    animator = PacedAnimator(fade_duration=min(.12, total * .03))
    if Path(CRAFT_MODEL_PATH).is_file():
        session_options = ort.SessionOptions()
        session_options.intra_op_num_threads = threads
        session_options.inter_op_num_threads = 1
        animator._craft._session = ort.InferenceSession(CRAFT_MODEL_PATH, sess_options=session_options, providers=['CPUExecutionProvider'])

    def single_pass(builder):
        def command(*args, **kwargs):
            cmd = builder(*args, **kwargs)
            cmd[0] = os.environ.get('FFMPEG_PATH', 'ffmpeg')
            # Second input is our local, measured narration. All paths are structured args.
            input_index = cmd.index('-i') + 2
            cmd[input_index:input_index] = ['-i', spec['audio']]
            cmd.remove('-an')
            # Upstream passes a bitrate; CRF is our common quality policy.
            bitrate_index = cmd.index('-b:v')
            del cmd[bitrate_index:bitrate_index + 2]
            filters = []
            if '-vf' in cmd:
                index = cmd.index('-vf')
                filters.append(cmd[index + 1])
                del cmd[index:index + 2]
            filters.append(f'scale={width}:{height},setsar=1')
            if spec.get('captions'):
                # Caption filenames are generated scene IDs in cwd, never user filter expressions.
                caption = spec['captions']
                if not caption.replace('-', '').replace('.', '').isalnum():
                    raise ValueError('Unexpected caption filename')
                filters.append(f"subtitles={caption}:force_style='FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,Outline=2,MarginV=28'")
            cmd[-1:-1] = ['-vf', ','.join(filters), '-map', '0:v:0', '-map', '1:a:0',
                           '-af', 'apad', '-t', str(total), '-crf', str(spec['crf']),
                           '-threads', str(threads), '-filter_threads', '1', '-c:a', 'aac',
                           '-ar', '48000', '-ac', '2', '-b:a', '128k', '-movflags', '+faststart']
            return cmd
        return command

    # API-specific adaptation is isolated here and protected by pinned-package integration tests.
    video_encoding.ffmpeg_cmd = single_pass(video_encoding.ffmpeg_cmd)
    video_encoding.ffmpeg_cmd_tpad = single_pass(video_encoding.ffmpeg_cmd_tpad)
    animator.render_to_file(array, draw_duration, total, spec['output'], fps=24,
                            preset=spec['preset'], bitrate='1500k')
    return {'seconds': round(time.monotonic() - started, 3), 'inkFraction': ink_fraction,
            'drawingWidth': board_width, 'drawingHeight': board_height, 'singlePass': True,
            'scheduleScale': animator.schedule_scale, 'engine': 'whiteboard-animator', 'version': importlib.metadata.version('whiteboard-animator')}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--spec')
    args = parser.parse_args()
    if args.check:
        print(json.dumps(readiness()))
    elif args.spec:
        with open(args.spec, encoding='utf8') as file:
            spec = json.load(file)
        print(json.dumps(render(spec)))
    else:
        parser.error('Provide --check or --spec')
