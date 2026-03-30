export const toCountMap = (rows, keyName) =>
  rows.reduce((acc, row) => {
    acc[row[keyName]] = row._count._all;
    return acc;
  }, {});
