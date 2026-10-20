declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    /** 管理员写入令牌（至少16位），通过部署平台的密钥配置注入，勿写入源码 */
    ADMIN_TOKEN?: string;
  }
}
