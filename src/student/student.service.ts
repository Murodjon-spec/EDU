import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Student } from './models/student.model';
import { ImageService } from '../image/image.service';
import { v4 as uuid } from 'uuid';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { GroupService } from './../group/group.service';
import { AuthDto } from './dto/auth.dto';
import { Image } from '../image/models/image.model';
import { Group } from '../group/models/group.model';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class StudentService {
  constructor(
    @InjectModel(Student) private studentRepository: typeof Student,
    private readonly groupService: GroupService,
    private readonly imageService: ImageService,
    private readonly jwtService: JwtService,
  ) {}

  async login(authDto: AuthDto) {
    const { login, password } = authDto;
    const studentByLogin = await this.getStudentByLogin(login);
    if (!studentByLogin) {
      throw new UnauthorizedException('Login or password is wrong');
    }
    const isMatchPass = await bcrypt.compare(
      password,
      studentByLogin.hashed_password,
    );
    if (!isMatchPass) {
      throw new UnauthorizedException('Login or password is wrong');
    }
    const tokens = await this.getTokens(studentByLogin);
    const hashed_refresh_token = await bcrypt.hash(tokens.refresh_token, 7);
    await this.studentRepository.update(
      {
        hashed_refresh_token,
      },
      {
        where: { id: studentByLogin.id },
      },
    );
    const student = await this.getOne(studentByLogin.id);
    const response = {
      token: tokens.access_token,
      student,
    };
    return response;
  }

  async create(
    createStudentDto: CreateStudentDto,
    images: Express.Multer.File[],
    authHeader: string,
  ) {
    await this.isSuperAdmin(authHeader);
    await this.groupService.getOne(createStudentDto.group_id);
    const uploadedImages = await this.imageService.create(images);
    const studentByLogin = await this.getStudentByLogin(createStudentDto.login);
    if (studentByLogin) {
      throw new BadRequestException('Login already registered!');
    }
    const hashed_password = await bcrypt.hash(createStudentDto.password, 7);
    const newStudent = await this.studentRepository.create({
      id: uuid(),
      ...createStudentDto,
      hashed_password,
      image_id: uploadedImages[0]?.id,
    });
    return this.getOne(newStudent.id);
  }

  async findAll(authHeader: string) {
    await this.isAdmin(authHeader);
    return this.studentRepository.findAll({
      attributes: [
        'id',
        'full_name',
        'email',
        'phone',
        'telegram',
        'group_id',
        'image_id',
      ],
      include: [Group, Image],
    });
  }

  async findOne(id: string, authHeader: string) {
    await this.isUserSelf(id, authHeader);
    const student = await this.studentRepository.findOne({
      where: { id },
      attributes: [
        'id',
        'full_name',
        'email',
        'phone',
        'telegram',
        'group_id',
        'image_id',
      ],
      include: [Group, Image],
    });
    if (!student) {
      throw new HttpException('Student not found', HttpStatus.NOT_FOUND);
    }
    return student;
  }

  async update(
    id: string,
    updateStudentDto: UpdateStudentDto,
    images: Express.Multer.File[],
    authHeader: string,
  ) {
    await this.isUserSelf(id, authHeader);
    const student = await this.getOne(id);
    if (updateStudentDto.login) {
      const studentByLogin = await this.getStudentByLogin(
        updateStudentDto.login,
      );
      if (studentByLogin && studentByLogin.id != id) {
        throw new BadRequestException('Login already registered!');
      }
    }
    if (updateStudentDto.password) {
      const hashed_password = await bcrypt.hash(updateStudentDto.password, 7);
      await this.studentRepository.update(
        { hashed_password },
        { where: { id } },
      );
    }
    if (images.length) {
      if (student.image_id) {
        await this.studentRepository.update(
          { image_id: null },
          { where: { id } },
        );
        await this.imageService.remove(student.image_id);
      }
      const uploadedImages = await this.imageService.create(images);
      await this.studentRepository.update(
        { image_id: uploadedImages[0]?.id },
        { where: { id } },
      );
    }
    await this.studentRepository.update(updateStudentDto, { where: { id } });
    return this.getOne(id);
  }

  async updateGroup(
    id: string,
    updateGroupDto: UpdateGroupDto,
    authHeader: string,
  ) {
    await this.isSuperAdmin(authHeader);
    await this.getOne(id);
    await this.groupService.getOne(updateGroupDto.group_id);
    await this.studentRepository.update(updateGroupDto, { where: { id } });
    return this.getOne(id);
  }

  async remove(id: string, authHeader: string) {
    await this.isSuperAdmin(authHeader);
    const student = await this.getOne(id);
    await this.studentRepository.destroy({ where: { id } });
    if (student.image_id) {
      await this.imageService.remove(student.image_id);
    }
    return student;
  }

  async getTokens(student: Student) {
    const jwtPayload = {
      id: student.id,
      login: student.login,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: process.env.ACCESS_TOKEN_KEY,
        expiresIn: process.env.ACCESS_TOKEN_TIME,
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: process.env.REFRESH_TOKEN_KEY,
        expiresIn: process.env.REFRESH_TOKEN_TIME,
      }),
    ]);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async verifyAccessToken(authHeader: string) {
    try {
      const access_token = authHeader.split(' ')[1];
      const user = await this.jwtService.verify(access_token, {
        secret: process.env.ACCESS_TOKEN_KEY,
      });
      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async getStudentByLogin(login: string) {
    const student = await this.studentRepository.findOne({
      where: { login },
      attributes: [
        'id',
        'full_name',
        'email',
        'phone',
        'telegram',
        'login',
        'hashed_password',
        'group_id',
        'image_id',
      ],
      include: [Group, Image],
    });
    return student;
  }

  async getOne(id: string) {
    const student = await this.studentRepository.findOne({
      where: { id },
      attributes: [
        'id',
        'full_name',
        'email',
        'phone',
        'telegram',
        'group_id',
        'image_id',
      ],
      include: [Group, Image],
    });
    if (!student) {
      throw new HttpException('Student not found', HttpStatus.NOT_FOUND);
    }
    return student;
  }

  async isSuperAdmin(authHeader: string) {
    const user = await this.verifyAccessToken(authHeader);
    if (user.role !== 'super-admin') {
      throw new UnauthorizedException('Restricted action');
    }
  }

  async isAdmin(authHeader: string) {
    const user = await this.verifyAccessToken(authHeader);
    if (user.role !== 'super-admin' && user.role !== 'admin') {
      throw new UnauthorizedException('Restricted action');
    }
  }

  async isUserSelf(id: string, authHeader: string) {
    const user = await this.verifyAccessToken(authHeader);
    if (user.role !== 'super-admin' && user.id !== id) {
      throw new UnauthorizedException('Restricted action');
    }
  }
}
