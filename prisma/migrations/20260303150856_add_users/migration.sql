-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "last_name" VARCHAR(50) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "confidance_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
