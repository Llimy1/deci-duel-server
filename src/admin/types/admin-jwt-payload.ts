export interface AdminJwtPayload {
  type: 'admin';
  role: 'owner';
}

export interface AdminAuthRequest extends Request {
  admin: { role: 'owner' };
}
