/* 栖旅 · 运行配置

   backend = 'local'      ：所有数据只存在浏览器里（原型模式，行为与以前一致）
   backend = 'supabase'   ：接云端，注册 / 发帖 / 回复 / 点赞在所有人之间共享

   supabaseUrl / supabaseAnonKey 填 Supabase 项目里的那两个值。
   注意：anon key 本来就是给前端用的公开 key（真正的安全靠数据库行级权限），
   所以放进公开仓库没有问题；service_role key 绝对不能写进这里。
*/
window.QiyuConfig = {
  // 代理（qilv-api.deno.dev）部署并测通后，把这里改成 'supabase' 就正式启用云端
  backend: 'local',

  // 注意：这里填的是「转发代理」的地址，不是 supabase.co 直连地址。
  // 原因：*.supabase.co 在国内会被重置，代理放在 Deno Deploy 上（国内可直连），
  // 由它在云端去访问 Supabase。见 supabase/proxy.ts。
  supabaseUrl: 'https://qilv-api.deno.dev',

  // Supabase 的 publishable key：本来就是设计给前端公开使用的，安全靠数据库行级权限。
  // 绝不能把 secret key 填在这里。
  supabaseAnonKey: 'sb_publishable_BWHft8nFb7VP5HPNyHXLNA_xkMUKEly'
};
