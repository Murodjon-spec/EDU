import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import { SequelizeModule } from '@nestjs/sequelize';
import { AdminModule } from './admin/admin.module';
import { ImageModule } from './image/image.module';
import { RoleModule } from './role/role.module';
import { Admin } from './admin/models/admin.model';
import { Image } from './image/models/image.model';
import { Role } from './role/models/role.model';
import { TeacherModule } from './teacher/teacher.module';
import { SubjectModule } from './subject/subject.module';
import { TeacherSubjectModule } from './teacher-subject/teacher-subject.module';
import { Teacher } from './teacher/models/teacher.model';
import { Subject } from './subject/models/subject.model';
import { TeacherSubject } from './teacher-subject/models/teacher-subject.model';
import { StudentModule } from './student/student.module';
import { GroupModule } from './group/group.module';
import { Group } from './group/models/group.model';
import { Student } from './student/models/student.model';
import { TestModule } from './test/test.module';
import { QuestionModule } from './question/question.module';
import { AnswerModule } from './answer/answer.module';
import { Test } from './test/models/test.model';
import { Question } from './question/models/question.model';
import { Answer } from './answer/models/answer.model';
import { ResultModule } from './result/result.module';
import { ResultQuestionModule } from './result_question/result_question.module';
import { ResultAnswerModule } from './result_answer/result_answer.module';
import { Result } from './result/models/result.model';
import { ResultQuestion } from './result_question/models/result_question.model';
import { ResultAnswer } from './result_answer/models/result_answer.model';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: resolve(__dirname, 'static'),
    }),
    SequelizeModule.forRoot({
      dialect: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT),
      username: process.env.POSTGRES_USER,
      password: String(process.env.POSTGRES_PASSWORD),
      database: process.env.POSTGRES_DB,
      models: [
        Admin,
        Image,
        Role,
        Teacher,
        Subject,
        TeacherSubject,
        Group,
        Student,
        Test,
        Question,
        Answer,
        Result,
        ResultQuestion,
        ResultAnswer,
      ],
      autoLoadModels: true,
      logging: false,
    }),
    AdminModule,
    ImageModule,
    RoleModule,
    TeacherModule,
    SubjectModule,
    TeacherSubjectModule,
    StudentModule,
    GroupModule,
    TestModule,
    QuestionModule,
    AnswerModule,
    ResultModule,
    ResultQuestionModule,
    ResultAnswerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
