# ⚡ Gadget Shop — Backend System & Core Engine

Welcome to the **Backend Engine of Gadget Shop** — the secure central system that powers the online gadget store, manages product inventory, safeguards customer accounts, and processes orders smoothly in real time.

---

## 🔗 Live Links & Repositories

- ⚙️ **Backend Live API**: [https://gadget-shop-backend-8t3x.onrender.com](https://gadget-shop-backend-8t3x.onrender.com)
- 🗄️ **Backend Source Code**: [https://github.com/Ahsanul-Islam-083/gadget-shop-backend](https://github.com/Ahsanul-Islam-083/gadget-shop-backend)
- 🌐 **Frontend Live Store**: [https://gadget-shop-client-blue.vercel.app](https://gadget-shop-client-blue.vercel.app)
- 💻 **Frontend Source Code**: [https://github.com/Ahsanul-Islam-083/gadget-shop-client](https://github.com/Ahsanul-Islam-083/gadget-shop-client)

---

## 🧠 What is this Backend System?

Think of the backend as the **secure warehouse and manager** of the store:
- While the **Frontend** is the store showroom where you see and click on products,
- The **Backend** is the engine behind the scenes making sure your password is kept safe, your shopping cart stays saved even if you refresh the page, stock counts are always accurate, and your order gets safely logged and processed.

---

## 🌟 What This System Does for You

### 1. 🔒 Keeps Your Account Safe & Secure
- **Safe Passwords**: Your password is encrypted and never stored in plain text.
- **Easy Sign-In with Google**: Lets you log in securely with your Google account without needing to remember a separate password.
- **Stay Logged In Securely**: Issues a secure digital pass (token) so you stay safely signed in while shopping.
- **Profile Self-Management**: Allows you to update your profile name, upload an avatar photo, or change your password anytime.

### 2. 🔍 Powers Fast Search & Product Catalog
- **Instant Product Search**: Allows you to search through gadgets by name, category, or budget.
- **Live Stock Checks**: Keeps track of available units so products are never oversold.

### 3. 🛒 Saves Your Cart & Wishlist
- Keeps your selected cart items and saved wishlist items synchronized to your account across multiple devices or browsers.

### 4. 📦 Handles Your Orders Step-by-Step
- When you click "Place Order", this system creates your order record, locks in your items, and tracks its delivery status from **Pending** to **Processing**, **Shipped**, and **Delivered**.

### 5. 🛡️ Provides Store Owners with Administrative Control
- Gives store administrators a secure way to add new products, update prices, manage inventory levels, view customer orders, and manage staff roles.

---

## 🚀 How to Run the Backend on Your Computer

If you want to test or run this backend service locally:

### 1. Download / Clone the Repository
```bash
git clone https://github.com/Ahsanul-Islam-083/gadget-shop-backend.git
cd gadget-shop-backend
```

### 2. Install Project Dependencies
```bash
npm install
```

### 3. Set Up the Database & Start the Server
```bash
# Setup database schema and demo sample data
npm run migrate
npm run seed

# Start the server
npm run dev
```

The backend server will start and listen at **`http://localhost:5000`**!
