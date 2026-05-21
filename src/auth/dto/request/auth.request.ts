export class DevSignupRequest {
  id: string;
  password: string;
  nickname: string;
}

export class DevLoginRequest {
  id: string;
  password: string;
}

export class RefreshRequest {
  refreshToken: string;
}
