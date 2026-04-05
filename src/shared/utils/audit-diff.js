const toComparableValue = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'object' && typeof value.toString === 'function') {
    return value.toString();
  }

  return value;
};

export const buildAuditDiff = (existingRecord, incomingData, fields) => {
  const oldValues = {};
  const newValues = {};

  for (const field of fields) {
    if (incomingData[field] === undefined) {
      continue;
    }

    const oldValue = toComparableValue(existingRecord[field]);
    const newValue = toComparableValue(incomingData[field]);

    if (oldValue !== newValue) {
      oldValues[field] = oldValue;
      newValues[field] = newValue;
    }
  }

  return { oldValues, newValues };
};
