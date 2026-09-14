#!/usr/bin/env python3
import json, os, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path('/home/administrator/video-lab')
ENV=ROOT/'secrets/providers.env'; OUT=ROOT/'provider-auth-check.json'

def load_env(p):
    d={}
    for line in p.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1); d[k]=v
    return d

def req(url, method='GET', headers=None, body=None):
    try:
        r=urllib.request.urlopen(urllib.request.Request(url,data=body,method=method,headers=headers or {}),timeout=15)
        return r.status
    except urllib.error.HTTPError as e: return e.code
    except Exception: return 0

env=load_env(ENV); now=datetime.now(timezone.utc).isoformat(); checks=[]
key=env.get('OPENROUTER_API_KEY','')
if key:
    st=req('https://openrouter.ai/api/v1/models',headers={'Authorization':'Bearer '+key})
    checks.append({'provider':'openrouter','credentialVariable':'OPENROUTER_API_KEY','checkedAt':now,'httpStatus':st,'authentication':'verified' if st==200 else 'rejected','generationVerified':False})
key=env.get('TAVILY_API_KEY','')
if key:
    body=json.dumps({'api_key':key,'query':'OpenAI','search_depth':'basic','max_results':1}).encode()
    st=req('https://api.tavily.com/search','POST',{'Content-Type':'application/json'},body)
    checks.append({'provider':'tavily','credentialVariable':'TAVILY_API_KEY','checkedAt':now,'httpStatus':st,'authentication':'verified' if st==200 else 'rejected','generationVerified':False})
OUT.write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps([{k:v for k,v in x.items() if k not in ('credential','key')} for x in checks],indent=2))
