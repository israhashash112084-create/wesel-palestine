import { prisma, prismaTransaction } from '#database/db.js';

export class CheckpointsRepository {
  _baseSelect() {
    return {
      id: true,
      name: true,
      areaName: true,
      description: true,
      latitude: true,
      longitude: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  _buildWhere({ status, search, minLat, maxLat, minLng, maxLng }) {
    const where = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          areaName: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (minLat !== undefined || maxLat !== undefined) {
      where.latitude = {};

      if (minLat !== undefined) {
        where.latitude.gte = minLat;
      }

      if (maxLat !== undefined) {
        where.latitude.lte = maxLat;
      }
    }

    if (minLng !== undefined || maxLng !== undefined) {
      where.longitude = {};

      if (minLng !== undefined) {
        where.longitude.gte = minLng;
      }

      if (maxLng !== undefined) {
        where.longitude.lte = maxLng;
      }
    }

    return where;
  }

  async findMany({
    status,
    search,
    minLat,
    maxLat,
    minLng,
    maxLng,
    skip,
    take,
    sortBy,
    sortOrder,
  }) {
    const where = this._buildWhere({ status, search, minLat, maxLat, minLng, maxLng });

    const { checkpoints, total } = await prismaTransaction(async (tx) => {
      const checkpoints = await tx.checkpoint.findMany({
        where,
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take,
        select: this._baseSelect(),
      });

      const total = await tx.checkpoint.count({ where });

      return { checkpoints, total };
    });

    return {
      checkpoints,
      total,
    };
  }

  async findByCoordinates(latitude, longitude) {
    return prisma.checkpoint.findFirst({
      where: {
        latitude,
        longitude,
      },
      select: {
        id: true,
      },
    });
  }

  async create(data) {
    return prisma.checkpoint.create({
      data: {
        name: data.name,
        areaName: data.areaName,
        description: data.description,
        latitude: data.latitude,
        longitude: data.longitude,
        ...(data.status && { status: data.status }),
        createdBy: data.createdBy,
      },
      select: this._baseSelect(),
    });
  }

  async findById(id) {
    return prisma.checkpoint.findUnique({
      where: { id },
      select: this._baseSelect(),
    });
  }
}
