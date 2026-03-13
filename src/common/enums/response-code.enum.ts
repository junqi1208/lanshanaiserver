export enum ResponseCode {
  // 成功
  SUCCESS = 200,

  // 客户端错误 (4xxx)
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,

  // 服务器错误 (5xxx)
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,

  // 业务错误 (1000+)
  USER_NOT_FOUND = 1001,
  USER_ALREADY_EXISTS = 1002,
  INVALID_PASSWORD = 1003,
  TOKEN_EXPIRED = 1004,
  INVALID_TOKEN = 1005,
  PERMISSION_DENIED = 1006,
  CONVERSATION_NOT_FOUND = 1007,
  MESSAGE_NOT_FOUND = 1008,
  AI_SERVICE_ERROR = 1009,
  SHARE_NOT_FOUND = 1010,
  INVALID_INPUT = 1011,
  RATE_LIMIT_EXCEEDED = 1012,
  FILE_TOO_LARGE = 1013,
  UNSUPPORTED_FILE_TYPE = 1014,
}

export const getErrorMessage = (code: number): string => {
  const codeMap: Record<number, string> = {
    [ResponseCode.SUCCESS]: '操作成功',
    [ResponseCode.BAD_REQUEST]: '请求参数错误',
    [ResponseCode.UNAUTHORIZED]: '未授权，请登录',
    [ResponseCode.FORBIDDEN]: '无权限访问',
    [ResponseCode.NOT_FOUND]: '资源不存在',
    [ResponseCode.CONFLICT]: '资源冲突',
    [ResponseCode.UNPROCESSABLE_ENTITY]: '请求数据格式错误',
    [ResponseCode.TOO_MANY_REQUESTS]: '请求过于频繁，请稍后再试',
    [ResponseCode.INTERNAL_SERVER_ERROR]: '服务器内部错误',
    [ResponseCode.USER_NOT_FOUND]: '用户不存在',
    [ResponseCode.USER_ALREADY_EXISTS]: '用户已存在',
    [ResponseCode.INVALID_PASSWORD]: '密码错误',
    [ResponseCode.TOKEN_EXPIRED]: '登录已过期，请重新登录',
    [ResponseCode.INVALID_TOKEN]: '无效的登录凭证',
    [ResponseCode.PERMISSION_DENIED]: '权限不足',
    [ResponseCode.CONVERSATION_NOT_FOUND]: '对话不存在',
    [ResponseCode.MESSAGE_NOT_FOUND]: '消息不存在',
    [ResponseCode.AI_SERVICE_ERROR]: 'AI服务暂时不可用',
    [ResponseCode.SHARE_NOT_FOUND]: '分享不存在',
    [ResponseCode.INVALID_INPUT]: '输入参数无效',
    [ResponseCode.RATE_LIMIT_EXCEEDED]: '操作过于频繁，请稍后再试',
    [ResponseCode.FILE_TOO_LARGE]: '文件过大',
    [ResponseCode.UNSUPPORTED_FILE_TYPE]: '不支持的文件类型',
  };

  return codeMap[code] || '未知错误';
};