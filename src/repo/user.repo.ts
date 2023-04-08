import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument, User } from './schemas/user.schema';

@Injectable()
export class UserRepo {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(user: User): Promise<User> {
    const newUser = new this.userModel(user);

    return newUser.save();
  }

  async update(user: User) {
    return this.userModel.findOneAndUpdate({ userId: user.userId }, user);
  }

  async getById(userId: string): Promise<User | null> {
    return this.userModel.findOne({ userId }).lean();
  }

  async getByIds(userIds: string[]): Promise<User[]> {
    return this.userModel.find({ userId: { $in: userIds } }).lean();
  }
}
