import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import { AuthService, AuthedMember } from './auth.service';

// 设备令牌守卫：从 Authorization: Bearer <token> 校验设备与成员状态
@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(private auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少设备令牌，请先绑定设备');
    }
    req.authedMember = await this.auth.validate(header.slice(7));
    return true;
  }
}

// 当前成员参数装饰器：@CurrentMember() member
export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedMember => {
    return ctx.switchToHttp().getRequest().authedMember;
  },
);
