/* 栖旅 · 运行配置

   backend = 'local'      ：所有数据只存在浏览器里（原型模式，行为与以前一致）
   backend = 'supabase'   ：接云端，注册 / 发帖 / 回复 / 点赞在所有人之间共享

   supabaseUrl / supabaseAnonKey 填 Supabase 项目里的那两个值。
   注意：anon key 本来就是给前端用的公开 key（真正的安全靠数据库行级权限），
   所以放进公开仓库没有问题；service_role key 绝对不能写进这里。
*/
window.QiyuConfig = {
  backend: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};
