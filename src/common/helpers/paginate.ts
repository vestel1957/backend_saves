export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export async function paginate<T>(
  model: {
    findMany: (args: any) => Promise<T[]>;
    count: (args: any) => Promise<number>;
  },
  options: {
    where?: any;
    orderBy?: any;
    select?: any;
    include?: any;
  },
  pagination: { page?: number; limit?: number },
): Promise<PaginatedResult<T>> {
  const page = pagination.page || 1;
  const limit = pagination.limit || 10;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    model.findMany({
      where: options.where,
      orderBy: options.orderBy,
      select: options.select,
      include: options.include,
      skip,
      take: limit,
    }),
    model.count({ where: options.where }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
}
