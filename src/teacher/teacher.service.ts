import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Teacher } from './models/teacher.model';
import { ImageService } from '../image/image.service';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from './dto/auth.dto';
import { v4 as uuid } from 'uuid';
import * as bcrypt from 'bcrypt';
import { Image } from '../image/models/image.model';

@Injectable()
export class TeacherService {
  constructor(
    @InjectModel(Teacher) private teacherRepository: typeof Teacher,
    private readonly imageService: ImageService,
    private readonly jwtService: JwtService,
  ) {}

  async login(authDto: AuthDto) {
    const { login, password } = authDto;
    const teacherByLogin = await this.getTeacherByLogin(login);
    if (!teacherByLogin) {
      throw new UnauthorizedException('Login or password is wrong');
    }
    const isMatchPass = await bcrypt.compare(
      password,
      teacherByLogin.hashed_password,
    );
    if (!isMatchPass) {
      throw new UnauthorizedException('Login or password is wrong');
    }
    const tokens = await this.getTokens(teacherByLogin);
    const hashed_refresh_token = await bcrypt.hash(tokens.refresh_token, 7);
    await this.teacherRepository.update(
      {
        hashed_refresh_token,
      },
      {
        where: { id: teacherByLogin.id },
      },
    );
    const teacher = await this.getOne(teacherByLogin.id);
    const response = {
      token: tokens.access_token,
      teacher,
    };
    return response;
  }

  async create(
    createTeacherDto: CreateTeacherDto,
    images: Express.Multer.File[],
    authHeader: string,
  ) {
    await this.isSuperAdmin(authHeader);
    const uploadedImages = await this.imageService.create(images);
    const teacherByLogin = await this.getTeacherByLogin(createTeacherDto.login);
    if (teacherByLogin) {
      throw new BadRequestException('Login already registered!');
    }
    const hashed_password = await bcrypt.hash(createTeacherDto.password, 7);
    const newTeacher = await this.teacherRepository.create({
      id: uuid(),
      ...createTeacherDto,
      hashed_password,
      image_id: uploadedImages[0]?.id,
    });
    return this.getOne(newTeacher.id);
  }

  async findAll(authHeader: string) {
    await this.isAdmin(authHeader);
    return this.teacherRepository.findAll({
      attributes: ['id', 'full_name', 'email', 'phone', 'telegram', 'image_id'],
      include: [Image],
    });
  }

  async findOne(id: string, authHeader: string) {
    await this.isUserSelf(id, authHeader);
    const teacher = await this.teacherRepository.findOne({
      where: { id },
      attributes: ['id', 'full_name', 'email', 'phone', 'telegram', 'image_id'],
      include: [Image],
    });
    if (!teacher) {
      throw new HttpException('Teacher not found', HttpStatus.NOT_FOUND);
    }
    return teacher;
  }

  async update(
    id: string,
    updateTeacherDto: UpdateTeacherDto,
    images: Express.Multer.File[],
    authHeader: string,
  ) {
    await this.isUserSelf(id, authHeader);
    const teacher = await this.getOne(id);
    if (updateTeacherDto.login) {
      const teacherByLogin = await this.getTeacherByLogin(
        updateTeacherDto.login,
      );
      if (teacherByLogin && teacherByLogin.id != id) {
        throw new BadRequestException('Login already registered!');
      }
    }
    if (updateTeacherDto.password) {
      const hashed_password = await bcrypt.hash(updateTeacherDto.password, 7);
      await this.teacherRepository.update(
        { hashed_password },
        { where: { id } },
      );
    }
    if (images.length) {
      if (teacher.image_id) {
        await this.teacherRepository.update(
          { image_id: null },
          { where: { id } },
        );
        await this.imageService.remove(teacher.image_id);
      }
      const uploadedImages = await this.imageService.create(images);
      await this.teacherRepository.update(
        { image_id: uploadedImages[0]?.id },
        { where: { id } },
      );
    }
    await this.teacherRepository.update(updateTeacherDto, { where: { id } });
    return this.getOne(id);
  }

  async remove(id: string, authHeader: string) {
    await this.isSuperAdmin(authHeader);
    const teacher = await this.getOne(id);
    await this.teacherRepository.destroy({ where: { id } });
    if (teacher.image_id) {
      await this.imageService.remove(teacher.image_id);
    }
    return teacher;
  }

  async getTokens(teacher: Teacher) {
    const jwtPayload = {
      id: teacher.id,
      login: teacher.login,
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

  async getTeacherByLogin(login: string) {
    const teacher = await this.teacherRepository.findOne({
      where: { login },
      attributes: [
        'id',
        'full_name',
        'email',
        'phone',
        'telegram',
        'login',
        'hashed_password',
        'image_id',
      ],
      include: [Image],
    });
    return teacher;
  }

  async getOne(id: string) {
    const teacher = await this.teacherRepository.findOne({
      where: { id },
      attributes: ['id', 'full_name', 'email', 'phone', 'telegram', 'image_id'],
      include: [Image],
    });
    if (!teacher) {
      throw new HttpException('Teacher not found', HttpStatus.NOT_FOUND);
    }
    return teacher;
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
