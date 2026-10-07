import { Controller, Get } from '@nestjs/common';
import type { Home } from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { HomeService } from './home.service.js';

/** The returning-user Home, in priority order (App Flow Blueprint section 8). */
@Controller('me/home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get()
  get(@CurrentUser() user: Principal): Promise<Home> {
    return this.home.get(user.userId);
  }
}
