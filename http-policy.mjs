import {validateHeaderValue} from 'node:http';

const allowed=new Set(['user-agent','accept','accept-language','cookie','authorization','referer','origin']);
export function normalizeHeaders(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Headers phải là một đối tượng.');
  const result={};
  for(const [key,value] of Object.entries(input)) {
    const name=key.toLowerCase();
    if(!allowed.has(name)||typeof value!=='string'||value.length>16384||name in result)throw new Error('Header không hợp lệ: '+key);
    validateHeaderValue(name,value);
    result[name]=value;
  }
  return result;
}
export function headersForURL(headers,from,to) {
  if(new URL(from).origin===new URL(to).origin)return {...headers};
  return Object.fromEntries(Object.entries(headers).filter(([key])=>!['cookie','authorization','referer','origin'].includes(key.toLowerCase())));
}
export function isGoogleURL(value) {
  const host=new URL(value).hostname;
  return ['google.com','googleusercontent.com'].some(domain=>host===domain||host.endsWith('.'+domain));
}
