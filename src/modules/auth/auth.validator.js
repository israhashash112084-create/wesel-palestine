import Joi from 'joi';

export const registerSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(8).max(255).required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(8).max(255).required(),
});

export const refreshCookieSchema = Joi.object({
  refreshToken: Joi.string().trim().min(20).max(4096).required(),
});
