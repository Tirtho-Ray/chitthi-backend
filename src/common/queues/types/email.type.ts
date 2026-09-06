export enum OtpType {
  REGISTER = 'REGISTER',
  FORGOT_PASSWORD = 'FORGOT_PASSWORD',
}

export interface OtpEmailJobPayload {
  email: string;
  otp: string;
  type: OtpType;
}
