/**
 * @param {number|string} page
 * @param {number|string} limit
 */
export const getPaginationParams = (page = 1, limit = 10) => {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);
  const pageNum = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage);
  const limitNum = Number.isNaN(parsedLimit) ? 10 : Math.max(1, parsedLimit);
  const safeLimit = Math.min(limitNum, 100);
  const skip = (pageNum - 1) * safeLimit;
  return {
    skip,
    take: safeLimit,
    buildPaginationMeta: (total) => {
      const totalPages = Math.max(1, Math.ceil(total / safeLimit));
      return {
        total,
        page: pageNum,
        limit: safeLimit,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      };
    },
  };
};
