import { Prisma } from '@prisma/client';

const normalizeMetaTarget = (target) => {
  if (Array.isArray(target)) {
    return target.filter((item) => typeof item === 'string');
  }

  if (typeof target === 'string') {
    return [target];
  }

  return [];
};

export const isPrismaUniqueConstraintError = (
  error,
  { constraintNames = [], fieldSets = [] } = {}
) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  if (constraintNames.length === 0 && fieldSets.length === 0) {
    return true;
  }

  const targets = normalizeMetaTarget(error.meta?.target);

  const hasConstraintName = constraintNames.some((constraintName) =>
    targets.some((target) => target.includes(constraintName))
  );

  const hasFieldSet = fieldSets.some((fields) =>
    fields.every((field) => targets.some((target) => target.includes(field)))
  );

  return hasConstraintName || hasFieldSet;
};

export const isPrismaRecordNotFoundError = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
