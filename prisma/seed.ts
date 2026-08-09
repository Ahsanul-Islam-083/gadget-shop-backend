import {
  PrismaClient,
  Prisma,
  UserRole,
  OrderStatus,
  PaymentStatus,
} from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CATEGORIES = [
  "Smartphones",
  "Audio",
  "Wearables",
  "Accessories",
];

const PRODUCTS = [
  { title: "Apple iPhone 16", brand: "Apple", description: "Latest flagship iPhone with the A18 chip and 48MP camera.", price: 999.99, stock: 10, category: "Smartphones" },
  { title: "Samsung Galaxy S24 Ultra", brand: "Samsung", description: "Premium Android flagship with built-in S Pen.", price: 1299.99, stock: 8, category: "Smartphones" },
  { title: "Google Pixel 9", brand: "Google", description: "AI-first Pixel with pro-level camera and 7 years of updates.", price: 799.99, stock: 12, category: "Smartphones" },
  { title: "Sony WH-1000XM5", brand: "Sony", description: "Industry-leading noise cancelling wireless headphones.", price: 399.99, stock: 15, category: "Audio" },
  { title: "Apple AirPods Pro 2", brand: "Apple", description: "Best-selling earbuds with active noise cancellation.", price: 249.99, stock: 20, category: "Audio" },
  { title: "JBL Flip 6", brand: "JBL", description: "Portable, waterproof Bluetooth speaker.", price: 129.99, stock: 25, category: "Audio" },
  { title: "Apple Watch Series 10", brand: "Apple", description: "The thinnest Apple Watch ever, with sleep apnea alerts.", price: 429.0, stock: 10, category: "Wearables" },
  { title: "Fitbit Charge 6", brand: "Google", description: "Fitness tracker with built-in GPS and ECG.", price: 159.95, stock: 14, category: "Wearables" },
  { title: "Anker 20W USB-C Charger", brand: "Anker", description: "Compact fast-charging wall adapter.", price: 19.99, stock: 50, category: "Accessories" },
  { title: "Spigen Ultra Hybrid Case", brand: "Spigen", description: "Clear, shock-absorbing phone case.", price: 24.99, stock: 40, category: "Accessories" },
];

const SAMPLE_REVIEWS = [
  { product: "Google Pixel 9", rating: 5, comment: "Best value flagship — the camera is incredible for the price." },
  { product: "Apple AirPods Pro 2", rating: 4, comment: "Great sound and ANC, battery life could be better." },
  { product: "JBL Flip 6", rating: 3, comment: "Solid speaker for the money, but the bass is muddy." },
];

const DAY = 24 * 60 * 60 * 1000;

async function ensureUser(
  email: string,
  name: string,
  password: string,
  role: UserRole
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`USER_EXISTS: ${email} (${existing.id})`);
    return existing;
  }
  const user = await prisma.user.create({
    data: { email, name, password: await bcrypt.hash(password, 10), role },
  });
  console.log(`USER_CREATED: ${email} (${user.id})`);
  return user;
}

async function ensureCategory(name: string) {
  const existing = await prisma.category.findUnique({ where: { name } });
  if (existing) {
    console.log(`CATEGORY_EXISTS: ${name} (${existing.id})`);
    return existing;
  }
  const category = await prisma.category.create({ data: { name } });
  console.log(`CATEGORY_CREATED: ${name} (${category.id})`);
  return category;
}

async function ensureProduct(
  data: { title: string; brand: string; description: string; price: number; stock: number; category: string }
) {
  const existing = await prisma.product.findFirst({ where: { title: data.title } });
  if (existing) {
    console.log(`PRODUCT_EXISTS: ${data.title} (${existing.id})`);
    return existing;
  }
  const category = await prisma.category.findUniqueOrThrow({
    where: { name: data.category },
  });
  const product = await prisma.product.create({
    data: {
      title: data.title,
      brand: data.brand,
      description: data.description,
      price: new Prisma.Decimal(data.price),
      stock: data.stock,
      categoryId: category.id,
    },
  });
  console.log(`PRODUCT_CREATED: ${data.title} (${product.id})`);
  return product;
}

async function ensureReview(
  userId: string,
  productId: string,
  rating: number,
  comment: string
) {
  const existing = await prisma.review.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (existing) {
    console.log(`REVIEW_EXISTS: user=${userId} product=${productId}`);
    return;
  }
  const review = await prisma.review.create({
    data: { userId, productId, rating, comment },
  });
  console.log(`REVIEW_CREATED: ${review.id} (${rating} stars)`);
}

async function main() {
  const admin = await ensureUser("admin@example.com", "Admin User", "admin123", UserRole.ADMIN);
  const customer = await ensureUser("customer1@example.com", "Demo Customer", "customer123", UserRole.CUSTOMER);

  for (const name of CATEGORIES) {
    await ensureCategory(name);
  }

  const products = new Map<string, { id: string; title: string; price: Prisma.Decimal }>();
  for (const p of PRODUCTS) {
    const created = await ensureProduct(p);
    products.set(created.title, { id: created.id, title: created.title, price: created.price });
  }

  for (const r of SAMPLE_REVIEWS) {
    const product = products.get(r.product);
    if (product) {
      await ensureReview(customer.id, product.id, r.rating, r.comment);
    }
  }

  const orderCount = await prisma.order.count({ where: { userId: customer.id } });
  if (orderCount > 0) {
    console.log("ORDERS_SKIPPED: demo customer already has orders");
    return;
  }

  const daysAgo = (d: number) => new Date(Date.now() - d * DAY);
  const iphone = products.get("Apple iPhone 16")!;
  const airpods = products.get("Apple AirPods Pro 2")!;
  const jbl = products.get("JBL Flip 6")!;

  await prisma.$transaction(async (tx) => {
    // Order 1: shipped + paid, created 10 days ago
    const total1 = new Prisma.Decimal(999.99).plus(new Prisma.Decimal(249.99).mul(2));
    const order1 = await tx.order.create({
      data: {
        userId: customer.id,
        totalAmount: total1,
        status: OrderStatus.SHIPPED,
        paymentStatus: PaymentStatus.PAID,
        createdAt: daysAgo(10),
      },
    });
    await tx.orderItem.createMany({
      data: [
        { orderId: order1.id, productId: iphone.id, quantity: 1, price: iphone.price },
        { orderId: order1.id, productId: airpods.id, quantity: 2, price: airpods.price },
      ],
    });
    await tx.orderStatusHistory.createMany({
      data: [
        { orderId: order1.id, status: OrderStatus.PENDING, changedBy: customer.id, changedAt: daysAgo(10) },
        { orderId: order1.id, status: OrderStatus.PROCESSING, changedBy: admin.id, changedAt: daysAgo(7) },
        { orderId: order1.id, status: OrderStatus.SHIPPED, changedBy: admin.id, changedAt: daysAgo(5) },
      ],
    });
    console.log(`ORDER_CREATED: ${order1.id} SHIPPED/PAID total=${total1}`);

    // Order 2: pending + unpaid, created today
    const total2 = new Prisma.Decimal(jbl.price);
    const order2 = await tx.order.create({
      data: {
        userId: customer.id,
        totalAmount: total2,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });
    await tx.orderItem.create({
      data: { orderId: order2.id, productId: jbl.id, quantity: 1, price: jbl.price },
    });
    await tx.orderStatusHistory.create({
      data: { orderId: order2.id, status: OrderStatus.PENDING, changedBy: customer.id },
    });
    console.log(`ORDER_CREATED: ${order2.id} PENDING/UNPAID total=${total2}`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());