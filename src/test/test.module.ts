import { Module, forwardRef } from '@nestjs/common';
import { TestService } from './test.service';
import { TestController } from './test.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test } from './models/test.model';
import { SubjectModule } from '../subject/subject.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    SequelizeModule.forFeature([Test]),
    forwardRef(() => SubjectModule),
    JwtModule,
  ],
  controllers: [TestController],
  providers: [TestService],
  exports: [TestService],
})
export class TestModule {}
