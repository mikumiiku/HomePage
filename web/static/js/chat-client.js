/* Browser-only OpenAI-compatible transport. Never forwards through this website. */
export function endpoint(raw, resource, site = window.location) {
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error('请输入完整的接口地址，例如 https://api.example.com/v1'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('接口地址只能包含 http(s) 地址和路径，不能包含密钥或查询参数。');
  if (url.hostname === site.hostname) throw new Error('请填写模型服务商地址，不能使用本站地址。');
  if (site.protocol === 'https:' && url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('当前页面需要 HTTPS 模型接口。');
  url.pathname = url.pathname.replace(/\/(chat\/completions|models)\/?$/, '').replace(/\/+$/, '') + '/' + resource;
  return url.href;
}
function headers(profile) {
  return {'Content-Type': 'application/json', ...(profile.key ? {Authorization: 'Bearer ' + profile.key} : {})};
}
function failure(status) {
  return new Error(({400:'模型不接受当前请求参数。请将思考等级设为默认、清空温度后重试，或检查所选模型是否支持聊天。',401:'密钥无效或已过期，请检查模型配置。',403:'接口拒绝访问，请检查密钥权限。',404:'找不到接口或模型，请检查接口地址和模型 ID。',429:'请求过于频繁或额度不足，请稍后重试。'})[status] || '模型服务返回错误（HTTP ' + status + '），请稍后重试。');
}
async function direct(url, options) {
  try { return await fetch(url, {...options, credentials:'omit', referrerPolicy:'no-referrer', redirect:'error'}); }
  catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('无法直连模型接口。请检查网络、地址和接口的跨域设置（CORS）；本站不会代理此请求。');
  }
}
export async function models(profile, signal) {
  const response = await direct(endpoint(profile.base, 'models'), {headers:headers(profile), signal});
  if (!response.ok) throw failure(response.status);
  const json = await response.json();
  if (!Array.isArray(json.data)) throw new Error('接口未返回有效的模型列表，请检查 Base URL 是否正确。');
  return [...new Set(json.data.map(x => x?.id).filter(x => typeof x === 'string' && x.trim() && x.length <= 200))].sort();
}
export async function complete(profile, messages, {signal, onDelta}) {
  const response = await direct(endpoint(profile.base, 'chat/completions'), {
    method:'POST', headers:headers(profile), signal,
    body:JSON.stringify({model:profile.model, messages, stream:true,
      ...(profile.reasoning ? {reasoning_effort:profile.reasoning} : {}),
      ...(profile.temperature === '' ? {} : {temperature:Number(profile.temperature)})})
  });
  if (!response.ok) throw failure(response.status);
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = await response.json();
    if (data.error) throw new Error('模型服务未能完成回复，请检查模型配置后重试。');
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content) throw new Error('模型没有返回文本回复。');
    onDelta(content, data.choices?.[0]?.message?.reasoning_content || '');
    return;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', ended = false, received = false;
  function event(block) {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
    if (!data) return;
    if (data === '[DONE]') { ended = true; return; }
    let value;
    try { value = JSON.parse(data); } catch { throw new Error('模型返回的数据格式不正确，请重试。'); }
    if (value.error) throw new Error('模型服务中断了回复，请稍后重试。');
    const choice = value.choices?.[0], delta = choice?.delta;
    if (delta?.content || delta?.reasoning_content) {
      received = true; onDelta(typeof delta.content === 'string' ? delta.content : '', typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '');
    }
    if (choice?.finish_reason === 'length') onDelta('\n\n（回复达到模型输出长度限制。）', '');
  }
  try {
    while (!ended) {
      const {done, value} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream:true});
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        event(buffer.slice(0,boundary)); buffer = buffer.slice(boundary+2);
        if (ended) break;
      }
      if (done) { if (buffer.trim() && !ended) event(buffer); break; }
      if (buffer.length > 1024*1024) throw new Error('模型返回的数据过大，已停止接收。');
    }
    if (!received) throw new Error('模型没有返回文本回复，请检查模型是否支持聊天。');
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
}
