import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestDocument, Request } from './schemas/request.schema';

@Injectable()
export class RequestRepo {
  constructor(
    @InjectModel(Request.name) private requestModel: Model<RequestDocument>,
  ) {}

  async create(request: Request): Promise<Request> {
    const newRequest = new this.requestModel(request);

    return newRequest.save();
  }

  async getById(requestId: string): Promise<Request | null> {
    return this.requestModel.findOne({ requestId }).lean();
  }
}
