# 🌾 Multilingual Mandi

A modern marketplace application connecting farmers and buyers with AI-powered multilingual support and real-time communication.

![Multilingual Mandi](https://img.shields.io/badge/Status-Active-green) ![React](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-3.4-cyan)

> ⚠️ **Prototype Notice**: This is a prototype project for demonstration and development purposes. It is **not ready for production use** and should not be deployed in live environments without significant additional development, security hardening, and testing.

## ✨ Features

### 🚀 Core Functionality
- **Dual Interface**: Seamlessly switch between Farmer (Vendor) and Buyer modes
- **AI Translation**: Powered by Google Gemini for real-time multilingual communication
- **Voice Input**: Natural voice-to-text for hands-free listing creation
- **Real-time Chat**: Multilingual messaging system between farmers and buyers
- **Smart Listing Extraction**: AI automatically extracts product details from natural language
- **Market Insights**: AI-powered price analysis and market condition reports
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices

### 🎯 User Experience
- **Intuitive Navigation**: Clean, modern interface with role-based dashboards
- **Local Storage**: Persistent data storage for listings and chat history
- **Loading States**: Smooth loading animations and error handling
- **Accessibility**: Screen reader friendly with proper ARIA labels

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | React 18 + TypeScript |
| **Styling** | Tailwind CSS 3.4 |
| **Build Tool** | Vite 6.4 |
| **AI Integration** | Google Gemini API |
| **Icons** | Lucide React |
| **Charts** | Recharts |
| **Development** | Hot Module Replacement, ESLint |

## 🚀 Getting Started

### Prerequisites

- **Node.js** 16+ ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- **Google Gemini API key** ([Get API Key](https://makersuite.google.com/app/apikey))

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-username/multilingual-mandi.git
cd multilingual-mandi
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
# Copy the environment template
cp .env.local .env.local.example
```

Add your Google Gemini API key to `.env.local`:
```env
VITE_GEMINI_API_KEY=your_actual_api_key_here
```

4. **Start the development server**
```bash
npm run dev
```

5. **Open your browser**
Navigate to [http://localhost:5173](http://localhost:5173)

## 📱 Usage Guide

### 👨‍🌾 For Farmers (Vendors)

1. **Switch to Farmer Mode**: Use the toggle in the top navigation
2. **Create Listings**: 
   - Describe your products in natural language
   - Use voice input for hands-free creation
   - AI automatically extracts product details (name, price, category, etc.)
3. **Manage Inventory**: View and organize your product listings
4. **Communicate**: Chat with interested buyers in multiple languages
5. **Get Insights**: View AI-generated market analysis for your products

### 🛒 For Buyers

1. **Switch to Buyer Mode**: Use the toggle in the top navigation
2. **Browse Products**: View available products from local farmers
3. **Product Details**: See comprehensive information including:
   - Product specifications
   - Pricing information
   - Market insights
   - Farmer contact details
4. **Start Conversations**: Initiate multilingual chats with farmers
5. **Negotiate**: Discuss prices and quantities in real-time

## 🔧 API Configuration

### Google Gemini Integration

The application leverages Google Gemini API for:

- **🌐 Translation**: Real-time text translation between multiple languages
- **📊 Data Extraction**: Converting natural language descriptions into structured product data
- **📈 Market Analysis**: Generating insights about pricing trends and market conditions

**Simulation Mode**: Without an API key, the app runs with mock responses for demonstration purposes.

## 📁 Project Structure

```
multilingual-mandi/
├── 📁 components/              # React UI components
│   ├── BuyerDashboard.tsx     # Buyer interface
│   ├── VendorDashboard.tsx    # Farmer interface
│   ├── ChatInterface.tsx      # Messaging system
│   ├── ListingCard.tsx        # Product display card
│   ├── PriceWidget.tsx        # Price analysis widget
│   └── VoiceInput.tsx         # Voice-to-text input
├── 📁 services/               # Business logic & APIs
│   ├── geminiService.ts       # AI integration
│   └── storageService.ts      # Local data management
├── 📄 types.ts                # TypeScript definitions
├── 📄 constants.ts            # Application constants
├── 📄 App.tsx                 # Main application component
├── 📄 index.tsx               # Application entry point
├── 📄 index.css               # Global styles
└── 📄 vite.config.ts          # Build configuration
```

## 🎨 Component Architecture

### Core Components

- **App.tsx**: Main application shell with routing and state management
- **VendorDashboard**: Farmer-specific interface for managing listings
- **BuyerDashboard**: Buyer interface for browsing and purchasing
- **ChatInterface**: Real-time messaging with translation
- **ListingCard**: Reusable product display component
- **VoiceInput**: Speech-to-text functionality

### Services

- **geminiService**: Handles all AI operations (translation, extraction, insights)
- **storageService**: Manages local data persistence

## 🔨 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build optimized production bundle |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint for code quality |

## 🌍 Supported Languages

The application supports multilingual communication including:
- **English** (en)
- **Hindi** (hi)
- **Bengali** (bn)
- **Tamil** (ta)
- **Telugu** (te)
- **Marathi** (mr)
- And more regional languages

## 🔒 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_GEMINI_API_KEY` | Google Gemini API key for AI features | Optional* |

*Required for full functionality; app runs in simulation mode without it.

## 🚀 Deployment

### Build for Production

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.

### Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

### Deploy to Netlify

```bash
npm run build
# Upload dist/ folder to Netlify
```

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use Tailwind CSS for styling
- Write meaningful commit messages
- Add JSDoc comments for complex functions
- Test your changes thoroughly

## 🐛 Troubleshooting

### Common Issues

**App stuck on loading screen:**
- Check browser console for errors
- Verify API key is correctly set
- Clear browser cache and localStorage

**Translation not working:**
- Ensure `VITE_GEMINI_API_KEY` is set correctly
- Check API key permissions and quotas
- Verify internet connection

**Voice input not working:**
- Grant microphone permissions
- Use HTTPS or localhost
- Check browser compatibility


## 🙏 Acknowledgments

- **Google Gemini** for AI capabilities
- **Tailwind CSS** for styling framework
- **Lucide** for beautiful icons
- **Vite** for fast development experience
- **React** community for excellent ecosystem

## 📞 Support

For support, email support@multilingual-mandi.com or create an issue on GitHub.

---

**Made with ❤️ for farmers and buyers worldwide** 🌾🤝🛒
