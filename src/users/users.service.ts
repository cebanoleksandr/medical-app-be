import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  async delete(id: string): Promise<void> {
    await this.users.delete({ id });
  }

  /** Registration is open: the first successful login creates the account. */
  async upsertOnLogin(email: string): Promise<User> {
    await this.users
      .createQueryBuilder()
      .insert()
      .values({ email, lastLoginAt: () => 'now()' })
      .orUpdate(['last_login_at'], ['email'])
      .execute();

    return this.users.findOneByOrFail({ email });
  }
}
