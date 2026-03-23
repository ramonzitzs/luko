/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, Component, ReactNode, ErrorInfo, useRef, useCallback } from 'react';
import { 
  Plus, 
  LayoutDashboard, 
  History, 
  Target, 
  ArrowUpRight, 
  ArrowDownLeft,
  Coffee,
  ShoppingBag,
  Car,
  Home,
  Utensils,
  MoreHorizontal,
  X,
  CreditCard,
  Settings as SettingsIcon,
  LogOut,
  ChevronRight,
  Wallet,
  Sparkles,
  Bell,
  Check,
  Droplets,
  Zap,
  Youtube,
  Trash2,
  Edit2,
  ArrowLeft,
  Calendar,
  Play,
  Eye,
  EyeOff,
  Fingerprint,
  Smartphone,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  AlertCircle,
  Download,
  PieChart as PieChartIcon,
  Users,
  Heart,
  Share2,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, Reorder } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  doc, 
  setDoc, 
  updateDoc,
  deleteDoc,
  orderBy,
  Timestamp,
  getDoc,
  getDocFromServer,
  getDocs,
  deleteField
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

// --- Types ---
interface Transaction {
  id: string;
  uid: string;
  familyId?: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: Date;
  cardId?: string;
  isRecurring?: boolean;
  installmentsCount?: number;
  installmentIndex?: number;
  parentTransactionId?: string;
  dueDay?: number;
  isPaid?: boolean;
  totalAmount?: number;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
}

interface Card {
  id: string;
  uid: string;
  familyId?: string;
  name: string;
  limit: number;
  color: string;
  currentSpend: number;
  dueDay?: number;
  order?: number;
}

interface IncomeSource {
  id: string;
  label: string;
  value: number;
}

interface UserSettings {
  incomes: IncomeSource[];
  monthlyLimit: number;
  pushNotifications?: boolean;
  privacyMode?: boolean;
  readNotificationIds?: string[];
  familyId?: string;
  duoEmail?: string;
  pendingInvite?: string;
  pixKey?: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'info' | 'success';
  date: Date;
  category?: string;
  transactionId?: string;
}

// --- Helper for Currency Formatting ---
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const parseCurrencyInput = (value: string): number => {
  const cleanValue = value.replace(/\D/g, '');
  return Number(cleanValue) / 100;
};

const getCurrentLocation = (): Promise<{ lat: number, lng: number, address?: string } | undefined> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(undefined);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Simple reverse geocoding using Nominatim (OpenStreetMap)
          // Note: In a production app, you'd use a more robust service or your own backend
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
            headers: {
              'Accept-Language': 'pt-BR'
            }
          });
          const data = await response.json();
          const address = data.address;
          const street = address.road || address.suburb || '';
          const city = address.city || address.town || address.village || '';
          const formattedAddress = street && city ? `${street}, ${city}` : (data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          
          resolve({ lat: latitude, lng: longitude, address: formattedAddress });
        } catch (error) {
          resolve({ lat: latitude, lng: longitude });
        }
      },
      () => {
        resolve(undefined);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  });
};

// --- Currency Input Component ---
const MoneyInput = ({ value, onChange, placeholder, className, name }: { value: number, onChange?: (val: number) => void, placeholder?: string, className?: string, name?: string }) => {
  const [displayValue, setDisplayValue] = useState(formatCurrency(value));

  useEffect(() => {
    setDisplayValue(formatCurrency(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = parseCurrencyInput(e.target.value);
    setDisplayValue(formatCurrency(numericValue));
    if (onChange) onChange(numericValue);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      name={name}
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
};

interface Category {
  name: string;
  icon: React.ReactNode;
  color: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// --- Constants ---
const CATEGORIES: Record<string, Category> = {
  Variados: { name: 'Variados', icon: <MoreHorizontal size={18} />, color: 'bg-slate-800 text-slate-400' },
  Alimentação: { name: 'Alimentação', icon: <Utensils size={18} />, color: 'bg-orange-500/10 text-orange-500' },
  Lazer: { name: 'Lazer', icon: <Coffee size={18} />, color: 'bg-purple-500/10 text-purple-500' },
  Gasolina: { name: 'Gasolina', icon: <Car size={18} />, color: 'bg-primary/10 text-primary' },
  Mensalidade: { name: 'Mensalidade', icon: <Home size={18} />, color: 'bg-emerald-500/10 text-emerald-500' },
  Assinatura: { name: 'Assinatura', icon: <Play size={18} />, color: 'bg-pink-500/10 text-pink-500' },
  Parcela: { name: 'Parcela', icon: <CreditCard size={18} />, color: 'bg-primary/10 text-primary' },
  Mercado: { name: 'Mercado', icon: <ShoppingBag size={18} />, color: 'bg-blue-500/10 text-blue-500' },
  'Pix do Rolê': { name: 'Pix do Rolê', icon: <Share2 size={18} />, color: 'bg-emerald-500/10 text-emerald-500' },
  Outros: { name: 'Outros', icon: <MoreHorizontal size={18} />, color: 'bg-slate-500/10 text-slate-500' },
};

const getInteractiveIcon = (title: string, category: string) => {
  const t = title.toLowerCase();
  
  if (category === 'Assinatura') {
    if (t.includes('netflix')) return <Play size={18} className="text-rose-600" />;
    if (t.includes('spotify')) return <Play size={18} className="text-emerald-500" />;
    if (t.includes('apple tv')) return <Play size={18} className="text-white" />;
    if (t.includes('prime video') || t.includes('amazon')) return <Play size={18} className="text-blue-400" />;
    if (t.includes('youtube')) return <Youtube size={18} className="text-rose-600" />;
    if (t.includes('disney')) return <Play size={18} className="text-blue-600" />;
    if (t.includes('paramount')) return <Play size={18} className="text-blue-500" />;
    if (t.includes('globoplay')) return <Play size={18} className="text-orange-500" />;
    return <Play size={18} />;
  }

  if (t.includes('luz') || t.includes('energia') || t.includes('elétrica')) return <Zap size={18} />;
  if (t.includes('água') || t.includes('sabesp') || t.includes('torneira')) return <Droplets size={18} />;
  if (t.includes('youtube') || t.includes('netflix') || t.includes('streaming') || t.includes('disney')) return <Youtube size={18} />;
  if (t.includes('mercado') || t.includes('compras')) return <ShoppingBag size={18} />;
  if (t.includes('uber') || t.includes('99') || t.includes('transporte')) return <Car size={18} />;
  if (t.includes('ifood') || t.includes('restaurante') || t.includes('jantar')) return <Utensils size={18} />;
  
  return CATEGORIES[category]?.icon || <MoreHorizontal size={18} />;
};

const CARD_COLORS = [
  { name: 'Roxo', value: 'bg-card-1' },
  { name: 'Laranja', value: 'bg-card-2' },
  { name: 'Verde', value: 'bg-card-3' },
  { name: 'Azul', value: 'bg-card-4' },
  { name: 'Escuro', value: 'bg-card-5' },
  { name: 'Vermelho', value: 'bg-card-6' },
];

// --- Error Handling ---
class ErrorBoundary extends Component<any, any> {
  state: any;
  props: any;

  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    // Ignore Vite WebSocket errors which are common in the preview environment
    const errorMessage = error?.message || String(error);
    if (
      errorMessage.includes('WebSocket') || 
      errorMessage.includes('[vite]') || 
      errorMessage.includes('closed without opened')
    ) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] bg-[#0F111A] flex items-center justify-center p-6 text-center text-white">
          <div className="bg-[#1C1F2B] p-8 rounded-[32px] border border-slate-800 max-w-md w-full">
            <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-500 mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-bold mb-2">Ops! Ocorreu um erro crítico</h2>
            <p className="text-slate-400 text-sm mb-6">{this.state.error?.message || "Erro desconhecido"}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl"
            >
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const GlobalErrorUI: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setError(event.error || new Error(event.message));
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      setError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  if (error) {
    console.error("GlobalErrorUI caught an error", error);
    let errorMessage = "Ocorreu um erro inesperado.";
    try {
      if (error.message) {
        const parsed = JSON.parse(error.message);
        if (parsed.error) errorMessage = `Erro de Permissão: ${parsed.operationType} em ${parsed.path}`;
      }
    } catch (e) {
      errorMessage = error.message || errorMessage;
    }

    return (
      <div className="min-h-[100dvh] bg-[#0F111A] flex items-center justify-center p-6 text-center text-white">
        <div className="bg-[#1C1F2B] p-8 rounded-[32px] border border-slate-800 max-w-md w-full">
          <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-500 mx-auto mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold mb-2">Ops! Algo deu errado</h2>
          <p className="text-slate-400 text-sm mb-6">{errorMessage}</p>
          <button 
            onClick={() => {
              setError(null);
              window.location.reload();
            }}
            className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl"
          >
            Recarregar Aplicativo
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

async function testFirestoreConnection() {
  console.log("Testing Firestore connection...");
  try {
    // Test connection to Firestore
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Firestore is offline. Please check your configuration and internet connection.");
    }
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error("Firestore Error:", { operationType, path, error });
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const TransactionItem: React.FC<{ t: Transaction, deleteTransaction: (id: string) => Promise<void> | void, privacyMode?: boolean, onClick?: () => void }> = ({ t, deleteTransaction, privacyMode, onClick }) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-60, -20, 0], [1, 0.5, 0]);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    await deleteTransaction(t.id);
    setShowConfirm(false);
  };

  return (
    <div className="relative overflow-hidden rounded-[20px]">
      <AnimatePresence>
        {showConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 bg-[#1C1F2B]/95 backdrop-blur-sm flex items-center justify-between px-6"
          >
            <p className="text-xs font-bold text-white uppercase tracking-widest">Excluir?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowConfirm(false);
                  x.set(0);
                }}
                className="px-4 py-2 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-transform"
              >
                Não
              </button>
              <button 
                onClick={handleDelete}
                className="px-4 py-2 bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-rose-500/20 active:scale-95 transition-transform"
              >
                Sim
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        style={{ opacity }}
        className="absolute inset-0 bg-rose-600 flex items-center justify-end px-6 text-white"
      >
        <Trash2 size={20} />
      </motion.div>
      <motion.div 
        drag="x"
        style={{ x }}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={() => {
          if (x.get() < -60) {
            setShowConfirm(true);
          } else {
            x.set(0);
          }
        }}
        onClick={onClick}
        whileDrag={{ scale: 1.02 }}
        className="bg-[#1C1F2B] p-4 rounded-[20px] flex items-center justify-between border border-slate-800/50 relative z-10 cursor-grab active:cursor-grabbing group"
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 ${CATEGORIES[t.category]?.color || 'bg-slate-800 text-slate-400'}`}>
            {getInteractiveIcon(t.title, t.category)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate pr-2">{t.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold truncate">{t.category}</span>
              {t.installmentsCount && t.installmentsCount > 1 && (
                <span className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">
                  {t.installmentIndex}/{t.installmentsCount}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right ml-4 flex-shrink-0">
          <div className="flex flex-col items-end">
            <p className={`font-bold text-sm ${t.type === 'income' ? 'text-emerald-500' : 'text-white'}`}>
              {t.type === 'income' ? '+' : '-'} {privacyMode ? '••••••' : formatCurrency(t.amount)}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[10px] font-bold text-slate-500">
                {t.date instanceof Date ? t.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : ''}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const NotificationItem: React.FC<{ 
  n: Notification, 
  onRead: (id: string) => void, 
  onClick: () => void
}> = ({ n, onRead, onClick }) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-60, -20, 0], [1, 0.5, 0]);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <motion.div 
        style={{ opacity }}
        className="absolute inset-0 bg-rose-600 flex items-center justify-end px-6 text-white"
      >
        <Trash2 size={20} />
      </motion.div>
      <motion.div 
        drag="x"
        style={{ x }}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={() => {
          if (x.get() < -60) {
            onRead(n.id);
          } else {
            x.set(0);
          }
        }}
        onClick={onClick}
        whileDrag={{ scale: 1.02 }}
        className="bg-[#0F111A] p-4 rounded-2xl border border-slate-800/50 flex items-center gap-4 relative z-10 cursor-grab active:cursor-grabbing group transition-transform"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 ${
          n.type === 'warning' ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary'
        }`}>
          {n.category && CATEGORIES[n.category] ? CATEGORIES[n.category].icon : <Bell size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-sm truncate">{n.title}</h4>
          <p className="text-xs text-slate-400 mt-1 truncate">{n.message}</p>
        </div>
        <div className="absolute right-4 opacity-10">
          <ChevronRight size={20} />
        </div>
      </motion.div>
    </div>
  );
};

const TypingText = ({ text, onComplete, skipAnimation }: { text: string, onComplete?: () => void, skipAnimation?: boolean }) => {
  const [displayedText, setDisplayedText] = useState(skipAnimation ? text : '');
  
  useEffect(() => {
    if (skipAnimation) {
      setDisplayedText(text);
      if (onComplete) onComplete();
      return;
    }
    let i = 0;
    setDisplayedText('');
    const timer = setInterval(() => {
      i++;
      setDisplayedText(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        if (onComplete) {
          // Small delay before calling onComplete to feel more natural
          setTimeout(onComplete, 500);
        }
      }
    }, 25);
    return () => clearInterval(timer);
  }, [text, skipAnimation]);

  // Robust parser for **text** that works during typing
  const parts = displayedText.split(/(\*\*)/g);
  let isBold = false;
  return (
    <span>
      {parts.map((part, index) => {
        if (part === '**') {
          isBold = !isBold;
          return null;
        }
        
        const isNegative = isBold && (part.includes('-R$') || part.includes('R$ -') || part.trim().startsWith('-'));
        
        return (
          <span 
            key={index} 
            className={isBold ? (isNegative ? "text-red-500 font-bold" : "text-[#cdfc54] font-bold") : ""}
          >
            {part}
          </span>
        );
      })}
    </span>
  );
};

const ChatMessage = ({ text, delay, avatar, isLast = false, onComplete, skipAnimation }: { text: string, delay: number, avatar: string, isLast?: boolean, onComplete?: () => void, skipAnimation?: boolean }) => {
  const [visible, setVisible] = useState(skipAnimation);
  const [typing, setTyping] = useState(false);
  const [startTyping, setStartTyping] = useState(skipAnimation);

  useEffect(() => {
    if (skipAnimation) {
      setVisible(true);
      setTyping(false);
      setStartTyping(true);
      return;
    }
    const showTimer = setTimeout(() => {
      setVisible(true);
      setTyping(true);
      const typingTimer = setTimeout(() => {
        setTyping(false);
        setStartTyping(true);
      }, 1200);
      return () => clearTimeout(typingTimer);
    }, delay);
    return () => clearTimeout(showTimer);
  }, [delay, skipAnimation]);

  if (!visible) return null;

  return (
    <motion.div 
      initial={skipAnimation ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-5 ${isLast ? '' : 'mb-10'}`}
    >
      <div className="flex-shrink-0 mt-1">
        <img 
          src={avatar} 
          className="w-7 h-7 rounded-full object-cover" 
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="flex-1">
        {typing ? (
          <div className="flex gap-1.5 py-2">
            <div className="w-1.5 h-1.5 bg-[#cdfc54] rounded-full animate-bounce [animation-duration:0.6s]" />
            <div className="w-1.5 h-1.5 bg-[#cdfc54] rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.15s]" />
            <div className="w-1.5 h-1.5 bg-[#cdfc54] rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.3s]" />
          </div>
        ) : (
          <div className="text-white text-[19px] font-semibold leading-[1.5] tracking-tight">
            {startTyping ? <TypingText text={text} onComplete={onComplete} skipAnimation={skipAnimation} /> : null}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const LukinhoChat = ({ transactions, settings, isReady, userName, prediction, onComplete, skipAnimation }: { transactions: Transaction[], settings: UserSettings, isReady: boolean, userName?: string, prediction: string, onComplete?: (finished: boolean) => void, skipAnimation?: boolean }) => {
  const [show, setShow] = useState(skipAnimation);
  const [messages, setMessages] = useState<{ greeting: string, prediction: string, quota: string } | null>(null);
  const prevPredictionRef = useRef<string>('');

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);

  const formatBRL = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Helper to get a stable index based on the prediction string
  const getStableIndex = (str: string, max: number, salt: string) => {
    let hash = 0;
    const combined = str + salt;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash) + combined.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % max;
  };

  useEffect(() => {
    if (isReady && prediction) {
      const isNewPrediction = prediction !== prevPredictionRef.current;
      
      if (isNewPrediction) {
        setShow(false);
        prevPredictionRef.current = prediction;
      } else if (messages) {
        // If same prediction and we already have messages, just ensure they are shown
        setShow(true);
        return;
      }

      // 1. Calculations based on user's explicit logic
      const totalIncome = settings.incomes.reduce((acc, i) => acc + (Number(i.value) || 0), 0);
      const limit = settings.monthlyLimit || totalIncome;
      
      const currentMonthExpenses = transactions.filter(t => {
        const tDate = new Date(t.date);
        const isSameMonth = tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
        const isRecurring = t.isRecurring || t.category === 'Assinaturas' || t.category === 'Mensalidade';
        const isFutureOrCurrent = (currentYear > tDate.getFullYear()) || (currentYear === tDate.getFullYear() && currentMonth >= tDate.getMonth());
        return t.type === 'expense' && (isSameMonth || (isRecurring && isFutureOrCurrent));
      });

      const totalMonthlyExpenses = currentMonthExpenses.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      
      const futureExpenses = currentMonthExpenses
        .filter(t => !t.isPaid)
        .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

      // VALOR DISPONÍVEL (Exactly what shows on the dashboard)
      const dashboardAvailable = limit - totalMonthlyExpenses;
      
      // CHAT 2: PREVISÃO FINAL DO MÊS
      // A previsão para o fim do mês é o que sobra do limite após todos os gastos (pagos ou não)
      const finalBalance = dashboardAvailable;
      
      // CHAT 3: COTA DIÁRIA PARA O RESTANTE DO MÊS
      const dailyQuota = finalBalance / daysRemaining;

      // 2. Dynamic Messages
      const firstName = userName || 'Adriano';
      const greetings = [
        `Fala, ${firstName}! Fiz os cálculos aqui (e olha, quase queimei meus circuitos).`,
        `E aí, ${firstName}! Dei uma olhada nas tuas contas e o negócio tá frenético, mas calculei tudo.`,
        `Opa, ${firstName}! Terminei a matemática aqui. Não foi fácil, mas o Lukinho resolve.`,
        `Diz aí, ${firstName}! Fiz as contas aqui e tive que usar até os dedos do pé pra terminar.`
      ];

      const valStr = `**${formatBRL(Math.abs(finalBalance))}**`;
      const predictionMsgs = finalBalance > 0 
        ? [
            `Se você seguir nesse ritmo, termina o MÊS com ${valStr} no bolso. Dá pra ser feliz!`,
            `Olha só, a previsão é sobrar ${valStr} no último dia do mês. Já dá pra planejar o fds!`,
            `Tudo pago e ainda sobram ${valStr} no fim do mês. Você tá voando, campeão!`
          ]
        : [
            `Ih, rapaz... se pagar tudo até o fim do mês, vai faltar ${valStr}. Hora de vender um rim!`,
            `A conta não fecha pro mês: vai ficar ${valStr} no vermelho. O Serasa já tá de olho...`,
            `Previsão de ${valStr} negativos no fim do mês. Melhor começar a treinar a dieta do sol!`
          ];

      const quotaStr = `**${formatBRL(Math.abs(dailyQuota))}**`;
      const quotaMsgs = dailyQuota > 0 
        ? [
            `Pra não passar vergonha, você só pode gastar ${quotaStr} por dia. Segura esse cartão!`,
            `Sua meta de hoje é não passar de ${quotaStr}. Se sobrar, é lucro!`,
            `Liberado gastar ${quotaStr} hoje. Se gastar mais, o iFood vai ter que ser deletado!`,
            `Foca no objetivo: ${quotaStr} por dia é o seu limite de sobrevivência.`
          ]
        : [
            `Pode parar tudo! Você já estourou o limite e não pode gastar mais **NADA** hoje. Segura a emoção!`,
            `Cota diária: **ZERO**. Nada de gastos extras se quiser sobreviver até o fim do mês!`,
            `O Lukinho avisa: sua cota de hoje acabou. Fecha essa carteira e vai ler um livro!`
          ];

      setMessages({
        greeting: greetings[getStableIndex(prediction, greetings.length, 'greet')],
        prediction: predictionMsgs[getStableIndex(prediction, predictionMsgs.length, 'pred')],
        quota: quotaMsgs[getStableIndex(prediction, quotaMsgs.length, 'quota')]
      });

      if (isNewPrediction) {
        const timer = setTimeout(() => setShow(true), 800);
        return () => clearTimeout(timer);
      } else {
        setShow(true);
      }
    }
  }, [isReady, prediction, transactions.length, settings.incomes.length, settings.monthlyLimit, skipAnimation]);

  if (!show || !messages) return null;

  const avatar = "https://tidas.com.br/arquivos/avatar_chat.png";

  return (
    <motion.div 
      initial={skipAnimation ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className="pt-[65px] pb-[65px] px-2"
    >
      <ChatMessage 
        avatar={avatar}
        delay={0}
        text={messages.greeting}
        skipAnimation={skipAnimation}
      />
      
      <ChatMessage 
        avatar={avatar}
        delay={4000}
        text={messages.prediction}
        skipAnimation={skipAnimation}
      />
      
      <ChatMessage 
        avatar={avatar}
        delay={9000}
        isLast
        text={messages.quota}
        onComplete={() => onComplete?.(true)}
        skipAnimation={skipAnimation}
      />
    </motion.div>
  );
};

const LukinhoSincero = ({ transactions, settings, userName, onChatComplete, skipAnimation }: { transactions: Transaction[], settings: UserSettings, userName?: string, onChatComplete?: (finished: boolean) => void, skipAnimation?: boolean }) => {
  const [prediction, setPrediction] = useState<string>(() => {
    try {
      const cached = localStorage.getItem('luko_prediction_v3');
      const cachedTime = localStorage.getItem('luko_oracle_time_v3');
      const now = new Date().getTime();
      if (cached && cachedTime && (now - parseInt(cachedTime)) < 8 * 60 * 60 * 1000) {
        return cached;
      }
    } catch (e) {
      console.warn('LocalStorage not available');
    }
    return '';
  });
  const [loading, setLoading] = useState(!prediction);
  const [isVideoLoaded, setIsVideoLoaded] = useState(skipAnimation);

  useEffect(() => {
    if (skipAnimation) {
      setIsVideoLoaded(true);
      return;
    }
    // Fallback: if video takes too long to load, show content anyway
    const timer = setTimeout(() => {
      setIsVideoLoaded(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [skipAnimation]);

  useEffect(() => {
    const generatePrediction = async () => {
      try {
        const now = new Date().getTime();
        
        const now_date = new Date();
        const currentMonth = now_date.getMonth();
        const currentYear = now_date.getFullYear();

        const totalIncome = settings.incomes.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        const totalExpenses = transactions
          .filter(t => {
            const tDate = new Date(t.date);
            return t.type === 'expense' && 
                   tDate.getMonth() === currentMonth && 
                   tDate.getFullYear() === currentYear;
          })
          .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        
        const limit = Number(settings.monthlyLimit) || totalIncome;
        const balance = totalIncome - totalExpenses;

        // Create a signature of the current financial state
        const currentSignature = `${totalIncome}-${totalExpenses}-${limit}`;
        let cachedSignature = null;
        let cachedTime = null;
        let cachedPrediction = null;

        try {
          cachedSignature = localStorage.getItem('luko_data_signature_v3');
          cachedTime = localStorage.getItem('luko_oracle_time_v3');
          cachedPrediction = localStorage.getItem('luko_prediction_v3');
        } catch (e) {
          console.warn('LocalStorage not available');
        }

        // If we have a valid cache AND the data hasn't changed, don't re-fetch
        if (
          cachedPrediction && 
          cachedSignature === currentSignature && 
          cachedTime && 
          (now - parseInt(cachedTime)) < 8 * 60 * 60 * 1000
        ) {
          setPrediction(cachedPrediction);
          setLoading(false);
          return;
        }

        // If data changed or cache expired, fetch new prediction
        setLoading(true);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          const isVercel = window.location.hostname.includes('vercel.app');
          setPrediction(isVercel 
            ? 'Lukinho precisa da chave GEMINI_API_KEY configurada no Vercel.' 
            : 'Lukinho está de folga. Verifique a chave da API nos Segredos.');
          setLoading(false);
          return;
        }

        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Analise estes dados financeiros: Renda R$${totalIncome}, Gastos R$${totalExpenses}, Saldo R$${balance}, Limite R$${limit}. 
          Gere uma previsão para o ÚLTIMO DIA DO MÊS. 
          O tom deve ser CÔMICO, DESCOLADO e SINCERO (estilo "Lukinho", jovem e zueiro). 
          Se o saldo for positivo, brinque que ele vai ser o novo Elon Musk. 
          Se for negativo ou perto do limite, faça uma piada ácida sobre ele ter que comer miojo ou vender a alma. 
          Máximo 15 palavras. Responda apenas a frase.`,
        });
        
        const newPrediction = response.text || 'Lukinho está sem palavras para sua conta bancária.';
        
        setPrediction(newPrediction);
        try {
          localStorage.setItem('luko_prediction_v3', newPrediction);
          localStorage.setItem('luko_oracle_time_v3', now.toString());
          localStorage.setItem('luko_data_signature_v3', currentSignature);
        } catch (e) {
          console.warn('LocalStorage not available');
        }
      } catch (error) {
        console.error('Lukinho Error:', error);
        if (!prediction) {
          setPrediction('Lukinho está sem sinal. Tente novamente mais tarde.');
        }
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(generatePrediction, 1000);
    return () => clearTimeout(timeout);
  }, [transactions, settings.monthlyLimit, settings.incomes]);

  const isReady = !loading && isVideoLoaded && prediction;

  useEffect(() => {
    if (!isReady && !skipAnimation) {
      onChatComplete?.(false);
    }
  }, [isReady, skipAnimation]);

  return (
    <div className="min-h-[300px] flex flex-col justify-center relative">
      {/* Hidden video to trigger loading */}
      {!isVideoLoaded && (
        <video 
          src="https://tidas.com.br/arquivos/avatar.mp4" 
          onLoadedData={() => setIsVideoLoaded(true)}
          className="absolute opacity-0 pointer-events-none"
          muted={true}
          playsInline
        />
      )}

      <AnimatePresence mode="wait">
        {!isReady ? (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12"
          >
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-slate-400 text-sm font-medium animate-pulse">Carregando Lukinho sincero...</p>
          </motion.div>
        ) : (
          <motion.div 
            key="content"
            initial={skipAnimation ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="overflow-hidden relative group rounded-t-[32px]">
              <video 
                src="https://tidas.com.br/arquivos/avatar.mp4" 
                autoPlay 
                loop 
                muted={true}
                onCanPlay={(e) => e.currentTarget.muted = true}
                playsInline
                className="w-full h-auto object-contain"
              />
            </div>
            
            <motion.div 
              initial={skipAnimation ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: skipAnimation ? 0 : 0.2 }}
              className="bg-[#cdfc54] p-8 rounded-[32px] text-[#0f111a] shadow-[0_0_40px_rgba(205,252,84,0.35)] relative z-10 -mt-2"
            >
              <p className="text-3xl font-[1000] leading-[1.1] tracking-tight">
                <TypingText text={prediction} skipAnimation={skipAnimation} />
              </p>
            </motion.div>

            <LukinhoChat 
              transactions={transactions} 
              settings={settings} 
              isReady={isReady} 
              userName={userName}
              prediction={prediction}
              onComplete={onChatComplete}
              skipAnimation={skipAnimation}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [settings, setSettings] = useState<UserSettings>({ 
    incomes: [], 
    monthlyLimit: 0, 
    pushNotifications: true,
    privacyMode: false,
    readNotificationIds: [] 
  });
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [openedAccordion, setOpenedAccordion] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingIncome, setEditingIncome] = useState<IncomeSource | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [pixShareData, setPixShareData] = useState<{ amountPerPerson: number, pixKey: string } | null>(null);
  const [isEditingPixKey, setIsEditingPixKey] = useState(false);
  const [chatFinished, setChatFinished] = useState(false);
  const [hasVisitedLukinho, setHasVisitedLukinho] = useState(false);
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false);
  const [pushedNotificationIds, setPushedNotificationIds] = useState<Set<string>>(new Set());
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    console.log("Auth State Change:", { isAuthReady, user: !!user, uid: user?.uid });
  }, [isAuthReady, user]);

  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone || document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
      console.log("Is Standalone:", isStandaloneMode);
    };
    checkStandalone();
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      console.log("beforeinstallprompt event fired");
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Request geolocation permission on first load
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {});
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const [selectedHistoryCategory, setSelectedHistoryCategory] = useState<string>('Todas');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    const isOpen = isModalOpen || isCardModalOpen || !!editingCard || !!editingIncome || !!editingTransaction || isNotificationOpen || isMonthPickerOpen || !!pixShareData;
    setIsAnyModalOpen(isOpen);
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen, isCardModalOpen, editingCard, editingIncome, editingTransaction, isNotificationOpen, isMonthPickerOpen, pixShareData]);

  const [newTransCategory, setNewTransCategory] = useState('Variados');
  const [newTransCardId, setNewTransCardId] = useState('');

  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("onAuthStateChanged. User:", !!user);
      setUser(user);
      setIsAuthReady(true);
      if (user) {
        setActiveTab('dashboard');
        // Ensure user doc exists
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            incomes: [],
            monthlyLimit: 0,
            pushNotifications: true,
            readNotificationIds: []
          });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Real-time Data ---
  useEffect(() => {
    if (!user) return;

    const unsubSettings = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings({
          incomes: data.incomes || [],
          monthlyLimit: data.monthlyLimit || 0,
          pushNotifications: data.pushNotifications ?? true,
          privacyMode: data.privacyMode || false,
          readNotificationIds: data.readNotificationIds || [],
          familyId: data.familyId,
          duoEmail: data.duoEmail,
          pendingInvite: data.pendingInvite,
          pixKey: data.pixKey
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    return () => unsubSettings();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const targetId = settings.familyId || user.uid;
    const idField = settings.familyId ? 'familyId' : 'uid';

    const qTransactions = query(
      collection(db, 'transactions'), 
      where(idField, '==', targetId),
      orderBy('date', 'desc')
    );
    
    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      const transData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: (doc.data().date as Timestamp).toDate()
      })) as Transaction[];
      setTransactions(transData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    const qCards = query(collection(db, 'cards'), where(idField, '==', targetId));
    const unsubCards = onSnapshot(qCards, (snapshot) => {
      const cardData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Card[];
      cardData.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setCards(cardData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cards'));

    return () => {
      unsubTransactions();
      unsubCards();
    };
  }, [user, settings.familyId]);

  // --- Actions ---
  const handleLogin = async () => {
    console.log("Login attempt started.");
    try {
      await signInWithPopup(auth, googleProvider);
      console.log("Login successful.");
      setActiveTab('dashboard');
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => {
    console.log("Logout attempt.");
    signOut(auth);
  };

  const addTransaction = async (t: Omit<Transaction, 'id' | 'uid' | 'date'>) => {
    console.log("addTransaction attempt:", t);
    if (!user) return;
    try {
      console.log('Adding transaction:', t);
      const baseDate = new Date();
      const location = await getCurrentLocation();
      
      // Clean up undefined values for Firestore
      const cleanObject = (obj: any) => {
        const newObj = { ...obj };
        Object.keys(newObj).forEach(key => {
          if (newObj[key] === undefined || newObj[key] === null || newObj[key] === "") {
            delete newObj[key];
          }
        });
        return newObj;
      };
      
      if (t.category === 'Pix do Rolê') {
        const peopleCount = (t as any).peopleCount || 1;
        const amountPerPerson = Number((t.amount / peopleCount).toFixed(2));
        
        const newDoc = cleanObject({
          ...t,
          amount: amountPerPerson,
          uid: user.uid,
          familyId: settings.familyId,
          date: Timestamp.fromDate(baseDate),
          location: location,
          pixKey: settings.pixKey
        });
        delete (newDoc as any).peopleCount;
        
        await addDoc(collection(db, 'transactions'), newDoc);
        
        if (settings.pixKey) {
          setPixShareData({
            amountPerPerson: amountPerPerson,
            pixKey: settings.pixKey
          });
        }
      } else if (t.category === 'Parcela' && t.installmentsCount && t.installmentsCount > 1) {
        const parentId = Math.random().toString(36).substr(2, 9);
        const totalAmount = t.amount;
        const installmentAmount = Number((totalAmount / t.installmentsCount).toFixed(2));
        
        for (let i = 0; i < t.installmentsCount; i++) {
          const installmentDate = new Date(baseDate);
          installmentDate.setMonth(baseDate.getMonth() + i);
          
          if (t.dueDay) {
            installmentDate.setDate(t.dueDay);
          }
          
          // Adjust last installment to handle rounding
          const currentAmount = i === t.installmentsCount - 1 
            ? Number((totalAmount - (installmentAmount * (t.installmentsCount - 1))).toFixed(2))
            : installmentAmount;

          const newDoc = cleanObject({
            ...t,
            title: `${t.title} (${i + 1}/${t.installmentsCount})`,
            amount: currentAmount,
            totalAmount: totalAmount,
            uid: user.uid,
            familyId: settings.familyId,
            date: Timestamp.fromDate(installmentDate),
            installmentIndex: i + 1,
            parentTransactionId: parentId,
            installmentsCount: t.installmentsCount,
            isPaid: false,
            location: location
          });
          await addDoc(collection(db, 'transactions'), newDoc);
        }
      } else if (t.category === 'Mensalidade' || t.category === 'Assinatura') {
        const parentId = Math.random().toString(36).substr(2, 9);
        // Create 12 months of recurring transactions as separate docs
        for (let i = 0; i < 12; i++) {
          const transDate = new Date(baseDate);
          transDate.setMonth(baseDate.getMonth() + i);
          if (t.dueDay) {
            transDate.setDate(t.dueDay);
          }
          
          const newDoc = cleanObject({
            ...t,
            uid: user.uid,
            familyId: settings.familyId,
            date: Timestamp.fromDate(transDate),
            isRecurring: true,
            isPaid: false,
            parentTransactionId: parentId,
            location: location
          });
          await addDoc(collection(db, 'transactions'), newDoc);
        }
      } else {
        const transDate = new Date(baseDate);
        if (t.dueDay) {
          transDate.setDate(t.dueDay);
        }
        
        const newDoc = cleanObject({
          ...t,
          uid: user.uid,
          familyId: settings.familyId,
          date: Timestamp.fromDate(transDate),
          isRecurring: false,
          isPaid: true,
          location: location
        });
        await addDoc(collection(db, 'transactions'), newDoc);
      }
      
      // Update card spend if applicable
      if (t.cardId && t.type === 'expense') {
        const card = cards.find(c => c.id === t.cardId);
        if (card) {
          await updateDoc(doc(db, 'cards', t.cardId), {
            currentSpend: (card.currentSpend || 0) + t.amount
          });
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error adding transaction:', err);
      handleFirestoreError(err, OperationType.CREATE, 'transactions');
    }
  };

  const inviteSpouse = async (email: string) => {
    if (!user) return;
    try {
      // Search for user with this email
      const q = query(collection(db, 'users'), where('email', '==', email));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        alert('Usuário não encontrado. Peça para seu parceiro(a) se cadastrar no Luko primeiro.');
        return;
      }

      const spouseDoc = querySnapshot.docs[0];
      const spouseUid = spouseDoc.id;
      const familyId = settings.familyId || user.uid;

      // Update current user
      await updateDoc(doc(db, 'users', user.uid), {
        familyId: familyId,
        duoEmail: email
      });

      // Update spouse with pending invite
      await updateDoc(doc(db, 'users', spouseUid), {
        pendingInvite: user.email,
        pendingFamilyId: familyId
      });

      alert('Convite enviado com sucesso!');
    } catch (err) {
      console.error('Error inviting spouse:', err);
    }
  };

  const acceptInvite = async () => {
    if (!user || !settings.pendingInvite) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const data = userSnap.data();

      if (data?.pendingFamilyId) {
        await updateDoc(userRef, {
          familyId: data.pendingFamilyId,
          duoEmail: data.pendingInvite,
          pendingInvite: deleteField(),
          pendingFamilyId: deleteField()
        });
        alert('Convite aceito! Agora vocês compartilham as finanças.');
      }
    } catch (err) {
      console.error('Error accepting invite:', err);
    }
  };
  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    if (!user) return;
    try {
      const t = transactions.find(item => item.id === id);
      
      // If it's part of a group (installments/recurring)
      if (t?.parentTransactionId) {
        const relatedTransactions = transactions.filter(item => 
          item.parentTransactionId === t.parentTransactionId
        );
        
        // Fields that SHOULD be updated in bulk across all related transactions
        const bulkFields = ['title', 'amount', 'category', 'cardId', 'familyId'];
        const bulkData: any = {};
        Object.keys(data).forEach(key => {
          if (bulkFields.includes(key)) {
            bulkData[key] = (data as any)[key];
          }
        });

        const batch = relatedTransactions.map(related => {
          // For the specific transaction being edited, apply ALL changes (including isPaid/date)
          if (related.id === id) {
            return updateDoc(doc(db, 'transactions', related.id), data);
          }
          
          // For other related transactions, only apply bulk fields if any
          if (Object.keys(bulkData).length > 0) {
            const finalBulkData = { ...bulkData };
            // Special handling for title with index
            if (bulkData.title && related.installmentIndex && related.installmentsCount) {
              const cleanTitle = bulkData.title.replace(/\s\(\d+\/\d+\)$/, '');
              finalBulkData.title = `${cleanTitle} (${related.installmentIndex}/${related.installmentsCount})`;
            }
            return updateDoc(doc(db, 'transactions', related.id), finalBulkData);
          }
          return null;
        }).filter(Boolean) as Promise<void>[];
        
        await Promise.all(batch);
      } else {
        await updateDoc(doc(db, 'transactions', id), data);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${id}`);
    }
  };

  const deleteTransaction = async (id: string) => {
    console.log("deleteTransaction attempt:", id);
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `transactions/${id}`);
    }
  };

  const markAsPaid = async (id: string) => {
    if (!user) return;
    try {
      if (id.startsWith('card-bill-')) {
        const cardId = id.replace('card-bill-', '');
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        // Find all unpaid transactions for this card this month
        const toUpdate = transactions.filter(t => 
          t.cardId === cardId && 
          t.type === 'expense' && 
          !t.isPaid &&
          new Date(t.date).getMonth() === currentMonth &&
          new Date(t.date).getFullYear() === currentYear
        );

        // Update them all
        await Promise.all(toUpdate.map(t => 
          updateDoc(doc(db, 'transactions', t.id), { isPaid: true })
        ));
      } else {
        await updateDoc(doc(db, 'transactions', id), { isPaid: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transactions/${id}`);
    }
  };

  const addCard = async (c: Omit<Card, 'id' | 'uid' | 'currentSpend'>) => {
    console.log("addCard attempt:", c);
    if (!user) return;
    try {
      const cleanCard = {
        ...c,
        uid: user.uid,
        currentSpend: 0,
        order: cards.length
      };
      
      // Remove undefined/null values
      Object.keys(cleanCard).forEach(key => {
        if ((cleanCard as any)[key] === undefined || (cleanCard as any)[key] === null) {
          delete (cleanCard as any)[key];
        }
      });

      if (settings.familyId) {
        (cleanCard as any).familyId = settings.familyId;
      }

      await addDoc(collection(db, 'cards'), cleanCard);
      setIsCardModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'cards');
    }
  };

  const deleteCard = async (id: string) => {
    console.log("deleteCard attempt:", id);
    if (!user) return;
    if (!window.confirm('Tem certeza que deseja excluir este cartão?')) return;
    try {
      await deleteDoc(doc(db, 'cards', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `cards/${id}`);
    }
  };

  const updateCard = async (id: string, data: Partial<Card>) => {
    console.log("updateCard attempt:", id, data);
    if (!user) return;
    try {
      await updateDoc(doc(db, 'cards', id), data);
      setEditingCard(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `cards/${id}`);
    }
  };

  const updateCardsOrder = async (newCards: Card[]) => {
    setCards(newCards);
    try {
      const batch = newCards.map((card, index) => 
        updateDoc(doc(db, 'cards', card.id), { order: index })
      );
      await Promise.all(batch);
    } catch (err) {
      console.error('Error updating cards order:', err);
    }
  };

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    console.log("updateSettings attempt:", newSettings);
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), newSettings);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const addIncomeSource = () => {
    const newIncomes = [...settings.incomes, { id: Math.random().toString(36).substr(2, 9), label: 'Nova Renda', value: 0 }];
    updateSettings({ incomes: newIncomes });
  };

  const removeIncomeSource = (id: string) => {
    const newIncomes = settings.incomes.filter(i => i.id !== id);
    updateSettings({ incomes: newIncomes });
  };

  const updateIncomeSource = (id: string, label: string, value: number) => {
    const newIncomes = settings.incomes.map(i => i.id === id ? { ...i, label, value } : i);
    updateSettings({ incomes: newIncomes });
  };

  const filteredTransactions = useMemo(() => {
    const currentMonth = selectedMonth.getMonth();
    const currentYear = selectedMonth.getFullYear();
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    return transactions.filter(t => {
      const tDate = new Date(t.date);
      const isSameMonth = tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
      
      // Recurring/Subscription logic: show in future months
      const isRecurring = t.isRecurring || t.category === 'Assinaturas' || t.category === 'Mensalidade';
      const isFutureOrCurrent = (currentYear > tDate.getFullYear()) || (currentYear === tDate.getFullYear() && currentMonth >= tDate.getMonth());
      
      // Filter out future transactions for "Recent Transactions" view
      const isNotFuture = tDate <= now;
      
      return (isSameMonth || (isRecurring && isFutureOrCurrent)) && isNotFuture;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedMonth]);

  const extratoTransactions = useMemo(() => {
    const currentMonth = selectedMonth.getMonth();
    const currentYear = selectedMonth.getFullYear();

    return transactions.filter(t => {
      const tDate = new Date(t.date);
      const isSameMonth = tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
      
      const isRecurring = t.isRecurring || t.category === 'Assinaturas' || t.category === 'Mensalidade';
      const isFutureOrCurrent = (currentYear > tDate.getFullYear()) || (currentYear === tDate.getFullYear() && currentMonth >= tDate.getMonth());
      
      return isSameMonth || (isRecurring && isFutureOrCurrent);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedMonth]);

  const futureTransactions = useMemo(() => {
    const currentMonth = selectedMonth.getMonth();
    const currentYear = selectedMonth.getFullYear();
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    return transactions.filter(t => {
      const tDate = new Date(t.date);
      const isSameMonth = tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
      const isRecurring = t.isRecurring || t.category === 'Assinaturas' || t.category === 'Mensalidade';
      const isFutureOrCurrent = (currentYear > tDate.getFullYear()) || (currentYear === tDate.getFullYear() && currentMonth >= tDate.getMonth());
      
      // "Ainda vão vencer" means the due date in the selected month is in the future (not today)
      const day = t.dueDay || tDate.getDate();
      const effectiveDate = new Date(currentYear, currentMonth, day);
      effectiveDate.setHours(0, 0, 0, 0);
      const isFutureDate = effectiveDate > now;
      
      return t.type === 'expense' && (isSameMonth || (isRecurring && isFutureOrCurrent)) && !t.isPaid && isFutureDate;
    }).sort((a, b) => {
      const dayA = a.dueDay || new Date(a.date).getDate();
      const dayB = b.dueDay || new Date(b.date).getDate();
      return dayA - dayB;
    });
  }, [transactions, selectedMonth]);

  const billsDueThisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // End of current week (Sunday)
    const endOfWeek = new Date(today);
    const day = today.getDay();
    const diff = 6 - day; // days until Saturday
    endOfWeek.setDate(today.getDate() + diff + 1); // Sunday morning
    endOfWeek.setHours(0, 0, 0, 0);

    // Individual bills
    const individualBills = transactions.filter(t => {
      if (t.type !== 'expense' || t.isPaid || t.cardId) return false;
      const isBill = t.isRecurring || (t.installmentsCount && t.installmentsCount > 1);
      if (!isBill) return false;

      const tDate = new Date(t.date);
      tDate.setHours(0, 0, 0, 0);
      
      // Overdue or due within this week
      return tDate < endOfWeek;
    }).map(t => {
      const tDate = new Date(t.date);
      tDate.setHours(0, 0, 0, 0);
      
      let dueLabel = '';
      const diffDays = Math.ceil((tDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) dueLabel = 'Atrasada';
      else if (diffDays === 0) dueLabel = 'Vence hoje';
      else if (diffDays === 1) dueLabel = 'Vence amanhã';
      else dueLabel = tDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

      return {
        ...t,
        isCardBill: false,
        isOverdue: tDate < today,
        dueLabel
      };
    });

    // Card bills
    const cardBills = cards.filter(card => {
      if (!card.dueDay) return false;
      
      const dueDateThisMonth = new Date(currentYear, currentMonth, card.dueDay);
      dueDateThisMonth.setHours(23, 59, 59, 999); // End of day

      const isDueThisWeekOrPast = dueDateThisMonth < endOfWeek;
      
      if (!isDueThisWeekOrPast) return false;

      const unpaid = transactions.filter(t => 
        t.cardId === card.id && 
        t.type === 'expense' && 
        !t.isPaid &&
        (new Date(t.date).getMonth() === currentMonth && new Date(t.date).getFullYear() === currentYear)
      );
      
      return unpaid.length > 0;
    }).map(card => {
      const dueDateThisMonth = new Date(currentYear, currentMonth, card.dueDay!);
      dueDateThisMonth.setHours(0, 0, 0, 0);
      const isOverdue = dueDateThisMonth < today;
      
      let dueLabel = '';
      const diffDays = Math.ceil((dueDateThisMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) dueLabel = 'Atrasada';
      else if (diffDays === 0) dueLabel = 'Vence hoje';
      else if (diffDays === 1) dueLabel = 'Vence amanhã';
      else dueLabel = dueDateThisMonth.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

      const unpaid = transactions.filter(t => 
        t.cardId === card.id && 
        t.type === 'expense' && 
        !t.isPaid &&
        (new Date(t.date).getMonth() === currentMonth && new Date(t.date).getFullYear() === currentYear)
      );
      const amount = unpaid.reduce((acc, t) => acc + t.amount, 0);

      return {
        id: `card-bill-${card.id}`,
        cardId: card.id,
        title: `Fatura ${card.name}`,
        amount,
        category: 'Cartão',
        isCardBill: true,
        date: dueDateThisMonth,
        isOverdue,
        dueLabel
      };
    });

    return [...individualBills, ...cardBills].sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [transactions, cards]);

  const categoryData = useMemo(() => {
    const currentMonth = selectedMonth.getMonth();
    const currentYear = selectedMonth.getFullYear();
    const data: Record<string, number> = {};
    
    transactions
      .filter(t => {
        const tDate = new Date(t.date);
        return t.type === 'expense' && 
               tDate.getMonth() === currentMonth && 
               tDate.getFullYear() === currentYear;
      })
      .forEach(t => {
        data[t.category] = (data[t.category] || 0) + t.amount;
      });
    return Object.entries(data).map(([name, value]) => ({
      name,
      value,
      color: CATEGORIES[name]?.color.split(' ')[0].replace('bg-', '#').replace('/10', '') || '#64748b'
    }));
  }, [transactions, selectedMonth]);

  // --- Stats ---
  const stats = useMemo(() => {
    try {
      const currentMonth = selectedMonth.getMonth();
      const currentYear = selectedMonth.getFullYear();

      const monthlyExpenses = (transactions || [])
        .filter(t => {
          if (!t || !t.date) return false;
          const tDate = new Date(t.date);
          const isSameMonth = tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
          
          const isRecurring = t.isRecurring || t.category === 'Assinaturas' || t.category === 'Mensalidade';
          const isFutureOrCurrent = (currentYear > tDate.getFullYear()) || (currentYear === tDate.getFullYear() && currentMonth >= tDate.getMonth());
          
          return t.type === 'expense' && (isSameMonth || (isRecurring && isFutureOrCurrent));
        })
        .reduce((acc, t) => acc + (t.amount || 0), 0);
      
      const totalIncome = (settings.incomes || []).reduce((acc, i) => acc + (i.value || 0), 0);
      
      // Default limit to total income if not set
      const limit = settings.monthlyLimit || totalIncome;

      const available = limit - monthlyExpenses;
      const progress = limit > 0 ? (monthlyExpenses / limit) * 100 : 0;

      return { totalIncome, expenses: monthlyExpenses, available, progress, limit };
    } catch (error) {
      console.error("Error calculating stats:", error);
      return { totalIncome: 0, expenses: 0, available: 0, progress: 0, limit: 0 };
    }
  }, [transactions, settings, selectedMonth]);

  const notifications = useMemo(() => {
    const list: Notification[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Check due dates for all unpaid expenses that are considered "bills" (recurring or installments)
    transactions.forEach(t => {
      if (t.type === 'expense' && !t.isPaid && !t.cardId) {
        const isBill = t.isRecurring || (t.installmentsCount && t.installmentsCount > 1);
        if (!isBill) return;

        const tDate = new Date(t.date);
        tDate.setHours(0, 0, 0, 0);
        
        let n: Notification | null = null;
        if (tDate.getTime() < today.getTime()) {
          // Overdue
          n = {
            id: `overdue-${t.id}-${todayStr}`,
            title: 'Conta Vencida',
            message: `A conta "${t.title}" está atrasada!`,
            type: 'warning',
            date: new Date(),
            category: t.category,
            transactionId: t.id
          };
        } else if (tDate.getTime() === today.getTime()) {
          // Due today
          n = {
            id: `today-${t.id}-${todayStr}`,
            title: 'Vencimento Hoje',
            message: `A conta "${t.title}" vence hoje!`,
            type: 'warning',
            date: new Date(),
            category: t.category,
            transactionId: t.id
          };
        } else if (tDate.getTime() === tomorrow.getTime()) {
          // Due tomorrow
          n = {
            id: `tomorrow-${t.id}-${todayStr}`,
            title: 'Vencimento Amanhã',
            message: `A conta "${t.title}" vence amanhã.`,
            type: 'info',
            date: new Date(),
            category: t.category,
            transactionId: t.id
          };
        }

        if (n && !settings.readNotificationIds?.includes(n.id)) {
          list.push(n);
        }
      }
    });

    return list;
  }, [transactions, settings.readNotificationIds]);

  useEffect(() => {
    if (!settings.pushNotifications || !notifications.length) return;
    
    // Only push if permission is granted
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      notifications.forEach(n => {
        // Only push unread notifications that haven't been pushed in this session
        if (!settings.readNotificationIds?.includes(n.id) && !pushedNotificationIds.has(n.id)) {
          new Notification(n.title, {
            body: n.message,
            icon: '/favicon.ico'
          });
          setPushedNotificationIds(prev => {
            const next = new Set(prev);
            next.add(n.id);
            return next;
          });
        }
      });
    }
  }, [notifications, settings.pushNotifications, settings.readNotificationIds, pushedNotificationIds]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0F111A] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setOpenedAccordion(null);
    if (tab === 'history') {
      setSelectedHistoryCategory('Todas');
    }
    if (tab === 'goals') {
      setHasVisitedLukinho(true);
    }
  };

  const renderContent = () => {
    console.log("Rendering content. User:", !!user, "Tab:", activeTab, "isAuthReady:", isAuthReady);
    try {
      if (!user) {
        console.log("Rendering Login Screen");
        return (
          <div className="min-h-[100dvh] bg-[#cdfc54] flex flex-col items-center justify-center p-10 text-left relative overflow-hidden">
          {/* PWA Install Banner */}
          {deferredPrompt && (
            <motion.div 
              initial={{ y: -100 }}
              animate={{ y: 0 }}
              className="fixed top-0 left-0 right-0 p-4 z-50"
            >
              <div className="bg-[#0F111A] text-white p-4 rounded-2xl flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-3">
                  <Download size={20} className="text-[#cdfc54]" />
                  <p className="text-xs font-bold uppercase tracking-widest">Instale o Luko</p>
                </div>
                <button 
                  onClick={handleInstallClick}
                  className="bg-[#cdfc54] text-[#0F111A] px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest"
                >
                  Instalar
                </button>
              </div>
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            className="max-w-sm w-full relative z-10"
          >
            <div className="mb-16">
               <img 
                 src="https://lh3.googleusercontent.com/d/1caF8UPYKEXFJ0qyEmPhO92-KTi4JnpdP" 
                 className="w-32 h-auto" 
                 referrerPolicy="no-referrer"
                 alt="Luko Logo" 
               />
            </div>
            
            <div className="space-y-1 mb-24 font-poppins font-light">
              <p className="text-[#0F111A] text-4xl leading-[1.3] tracking-tight">Gastou,</p>
              <p className="text-[#0F111A] text-4xl leading-[1.3] tracking-tight">anotou,</p>
              <p className="text-[#0F111A] text-4xl leading-[1.3] tracking-tight">controlou.</p>
              <p className="text-[#0F111A] text-4xl leading-[1.3] tracking-tight">Simples assim.</p>
            </div>

            <div className="space-y-6">
              <button 
                onClick={handleLogin}
                className="w-full bg-[#0F111A] text-white font-black py-5 rounded-[24px] flex items-center justify-center gap-4 shadow-xl shadow-black/10 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <img src="https://www.google.com/favicon.ico" className="w-6 h-6" alt="Google" />
                Entrar com Google
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

      console.log("Rendering Main App. Tab:", activeTab);
      return (
        <div className="min-h-[100dvh] bg-[#0F111A] text-white font-sans pb-24">
        {/* Header */}
        <header className="p-6 pt-6 max-w-md mx-auto">
          <div className="flex justify-between items-center">
            <div 
              className="flex items-center gap-3 cursor-pointer active:scale-95 transition-transform"
              onClick={() => {
                setActiveTab('dashboard');
                setSelectedCardId(null);
              }}
            >
              <img src={user.photoURL || ''} className="w-9 h-9 rounded-full border border-slate-800" alt="Profile" />
              <div>
                <h1 className="text-lg font-bold tracking-tight leading-none">Olá, {user.displayName?.split(' ')[0]}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isStandalone && (
                <button 
                  onClick={() => {
                    if (deferredPrompt) {
                      deferredPrompt.prompt();
                    } else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
                      alert('Para instalar no iOS: toque no botão de Compartilhar e selecione "Adicionar à Tela de Início".');
                    } else {
                      alert('Use o menu do navegador para instalar o app.');
                    }
                  }}
                  className="p-2 text-primary hover:text-primary/80 transition-colors flex items-center justify-center"
                  title="Instalar App"
                >
                  <Download size={20} />
                </button>
              )}
              <button 
                onClick={() => updateSettings({ privacyMode: !settings.privacyMode })}
                className="p-2 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
              >
                {settings.privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
              <button 
                onClick={() => setIsMonthPickerOpen(true)}
                className="p-2 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
              >
                <Calendar size={20} className="relative -top-[1px]" />
              </button>
              <button 
                onClick={() => {
                  setIsNotificationOpen(true);
                  if (notifications.length > 0) {
                    const newReadIds = Array.from(new Set([...(settings.readNotificationIds || []), ...notifications.map(n => n.id)]));
                    // Keep only recent read IDs to avoid bloat (last 7 days)
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    const filteredReadIds = newReadIds.filter(id => {
                      const parts = id.split('-');
                      const dateStr = parts[parts.length - 1];
                      if (!dateStr || !dateStr.includes(':')) { // Simple check for YYYY-MM-DD
                        const d = new Date(dateStr);
                        return !isNaN(d.getTime()) && d >= sevenDaysAgo;
                      }
                      return true;
                    });
                    updateSettings({ readNotificationIds: filteredReadIds });
                  }
                }}
                className="relative p-2 flex items-center justify-center"
              >
                <Bell size={20} className={notifications.some(n => !settings.readNotificationIds?.includes(n.id)) ? "text-white" : "text-slate-400"} />
                {notifications.some(n => !settings.readNotificationIds?.includes(n.id)) && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-600 rounded-full border-2 border-[#0F111A]" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="px-6 max-w-md mx-auto space-y-6">
          
          {activeTab === 'dashboard' && (
            <motion.div initial={{ opacity: 1 }} animate={{ opacity: 1 }} className="space-y-8">
              {console.log("Dashboard Render Start. Cards:", cards.length, "Transactions:", transactions.length)}
              {(() => {
                try {
                  return (
                    <>
                      {selectedCardId ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSelectedCardId(null)} className="p-2 bg-[#1C1F2B] rounded-full border border-slate-800">
                      <ArrowLeft size={20} />
                    </button>
                    <h2 className="text-xl font-bold">Detalhes do Cartão</h2>
                  </div>
                  
                  {cards.find(c => c.id === selectedCardId) && (() => {
                    const card = cards.find(c => c.id === selectedCardId)!;
                    const cardSpend = transactions
                      .filter(t => {
                        const tDate = new Date(t.date);
                        return t.cardId === card.id && 
                               t.type === 'expense' && 
                               tDate.getMonth() === selectedMonth.getMonth() && 
                               tDate.getFullYear() === selectedMonth.getFullYear();
                      })
                      .reduce((acc, t) => acc + t.amount, 0);

                    return (
                      <div className={`${card.color === 'bg-slate-800' ? 'bg-[#1C1F2B] border border-slate-800' : card.color} rounded-[32px] p-8 text-white shadow-lg relative overflow-hidden min-h-[200px] flex flex-col justify-between`}>
                        <div className="relative z-10 h-full flex flex-col justify-between">
                          <div className="flex justify-between items-start mb-8">
                            <CreditCard className="opacity-80" size={28} />
                            {card.dueDay && (
                              <div className="bg-black/20 backdrop-blur-md px-4 py-1.5 rounded-full">
                                <p className="text-[10px] font-black uppercase tracking-widest">Vence dia {card.dueDay}</p>
                              </div>
                            )}
                          </div>
                          
                          <div className="space-y-1 mb-6">
                            <p className="text-[10px] opacity-60 uppercase tracking-widest font-black">{card.name}</p>
                            <div className="flex justify-between items-end gap-2">
                              <p className="text-3xl font-black tracking-tight">
                                {settings.privacyMode ? '••••••' : formatCurrency(cardSpend)}
                              </p>
                              <div className="text-right flex-shrink-0">
                                <p className="text-[10px] opacity-60 uppercase tracking-widest font-black mb-0.5 leading-none">Limite</p>
                                <p className="text-sm font-bold opacity-90 whitespace-nowrap">
                                  {settings.privacyMode ? '••••••' : formatCurrency(card.limit - card.currentSpend)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, (card.currentSpend / card.limit) * 100)}%` }}
                              className="h-full bg-white rounded-full"
                            />
                          </div>
                        </div>
                        
                        {/* Decorative circles */}
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
                        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
                      </div>
                    );
                  })()}

                  <section>
                    <h3 className="font-bold text-lg mb-4">Transações no Cartão</h3>
                    <div className="space-y-3">
                      {transactions.filter(t => {
                        const tDate = new Date(t.date);
                        return t.cardId === selectedCardId && 
                               tDate.getMonth() === selectedMonth.getMonth() && 
                               tDate.getFullYear() === selectedMonth.getFullYear();
                      }).length === 0 ? (
                        <p className="text-center text-slate-500 py-8">Nenhuma transação este mês.</p>
                      ) : (
                        <AnimatePresence mode="popLayout">
                          {transactions.filter(t => {
                            const tDate = new Date(t.date);
                            return t.cardId === selectedCardId && 
                                   tDate.getMonth() === selectedMonth.getMonth() && 
                                   tDate.getFullYear() === selectedMonth.getFullYear();
                          }).map(t => (
                            <TransactionItem 
                              key={t.id} 
                              t={t} 
                              deleteTransaction={deleteTransaction} 
                              privacyMode={settings.privacyMode} 
                              onClick={() => setSelectedTransaction(t)}
                            />
                          ))}
                        </AnimatePresence>
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <>
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-primary rounded-[32px] p-6 text-on-primary shadow-2xl shadow-primary/20 relative overflow-hidden"
                  >
                    <div className="relative z-10">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-on-primary/70 text-sm font-medium">Disponível</p>
                      </div>
                      <h2 className="text-4xl font-black mb-6">
                        {settings.privacyMode ? '••••••' : formatCurrency(stats.available)}
                      </h2>
                      
                      <div className="space-y-3">
                        <div className="h-2.5 bg-[#0F111A]/20 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, stats.progress)}%` }}
                            className="h-full bg-[#0F111A] rounded-full shadow-[0_0_10px_rgba(15,17,26,0.1)]"
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-on-primary/60 font-medium">
                          <div className="flex items-center gap-1">
                            <ArrowDownLeft size={10} />
                            <span>{formatCurrency(stats.expenses)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <ArrowUpRight size={10} />
                            <span>{formatCurrency(stats.limit)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <section>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg">Meus Cartões</h3>
                    </div>
                    <div className="overflow-hidden -mx-6 px-6">
                      <motion.div 
                        drag="x"
                        dragConstraints={{ right: 0, left: cards.length > 1 ? -((cards.length * 296) - (Math.min(window.innerWidth, 448) - 48)) : 0 }}
                        className="flex gap-4 cursor-grab active:cursor-grabbing"
                      >
                        {cards.length === 0 ? (
                          <div className="bg-[#1C1F2B] border-2 border-dashed border-slate-800 rounded-[24px] p-6 w-full text-center text-slate-500">
                            Nenhum cartão adicionado
                          </div>
                        ) : (
                          cards.map(card => (
                            <motion.div 
                              key={card.id} 
                              onTap={() => setSelectedCardId(card.id)}
                              className={`${card.color === 'bg-slate-800' ? 'bg-[#1C1F2B] border border-slate-800' : card.color} min-w-[280px] max-w-[280px] rounded-[28px] p-6 text-white shadow-lg relative overflow-hidden flex-shrink-0 h-44 active:scale-[0.98] transition-transform`}
                            >
                              <div className="relative z-10 h-full flex flex-col justify-between pointer-events-none">
                                <div className="flex justify-between items-start">
                                  <CreditCard className="opacity-80" size={24} />
                                  {card.dueDay && (
                                    <span className="text-[10px] font-bold opacity-60 bg-[#0F111A]/20 px-2 py-1 rounded-lg">Vence dia {card.dueDay}</span>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[10px] opacity-50 mb-1 uppercase tracking-widest font-bold">{card.name}</p>
                                  <div className="flex justify-between items-end gap-2">
                                    <p className="text-2xl font-bold whitespace-nowrap">
                                      {settings.privacyMode ? '••••••' : formatCurrency(transactions
                                        .filter(t => {
                                          const tDate = new Date(t.date);
                                          return t.cardId === card.id && 
                                                 t.type === 'expense' && 
                                                 tDate.getMonth() === selectedMonth.getMonth() && 
                                                 tDate.getFullYear() === selectedMonth.getFullYear();
                                        })
                                        .reduce((acc, t) => acc + t.amount, 0))}
                                    </p>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-[10px] font-bold opacity-60 leading-none">Limite</p>
                                      <p className="text-xs font-bold opacity-90 whitespace-nowrap">
                                        {settings.privacyMode ? '••••••' : formatCurrency(card.limit - card.currentSpend)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-white transition-all duration-500" 
                                      style={{ width: `${Math.min(100, (card.currentSpend / card.limit) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ))
                        )}
                      </motion.div>
                    </div>
                  </section>

                  {billsDueThisWeek.length > 0 && (
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg text-primary flex items-center gap-2">
                          <Calendar size={20} className="relative -top-[1px]" />
                          Pagar
                        </h3>
                      </div>
                      <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                          {billsDueThisWeek.map((t) => (
                            <motion.div 
                              key={t.id}
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9, x: -20 }}
                              className={`${t.isOverdue ? 'bg-rose-500/10 border-rose-500/30' : 'bg-[#1C1F2B] border-slate-800/50'} border rounded-[20px] p-4 flex items-center justify-between active:scale-[0.98] transition-transform`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={`w-10 h-10 flex-shrink-0 ${t.isOverdue ? 'bg-rose-500/20 text-rose-500' : 'bg-slate-800 text-slate-400'} rounded-xl flex items-center justify-center`}>
                                  {getInteractiveIcon(t.title, t.category)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-bold truncate pr-2 ${t.isOverdue ? 'text-rose-500' : 'text-white'}`}>{t.title}</p>
                                  <p className={`text-[10px] ${t.isOverdue ? 'text-rose-500/60' : 'text-slate-500'} font-bold uppercase tracking-widest truncate`}>
                                    {t.category}
                                  </p>
                                  <p className={`text-[10px] font-bold ${t.isOverdue ? 'text-rose-500' : 'text-slate-500'} mt-0.5`}>
                                    {(t as any).dueLabel}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-4">
                                <p className={`text-sm font-black ${t.isOverdue ? 'text-rose-500' : 'text-white'}`}>
                                  {settings.privacyMode ? '••••••' : formatCurrency(t.amount)}
                                </p>
                                <button 
                                  onClick={() => markAsPaid(t.id)}
                                  className={`${t.isOverdue ? 'bg-rose-500 shadow-rose-500/20' : 'bg-primary shadow-primary/20'} text-on-primary text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl shadow-lg active:scale-95 transition-transform`}
                                >
                                  PAGAR
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </section>
                  )}

                  <section>
                    <div className="flex justify-between items-center mb-4">
                      <h3 
                        className="font-bold text-lg cursor-pointer hover:text-primary transition-colors"
                        onClick={() => {
                          setSelectedHistoryCategory('Todas');
                          setActiveTab('history');
                        }}
                      >
                        Transações recentes
                      </h3>
                    </div>
                    <div className="relative">
                      <div className="space-y-3 pb-6">
                        <AnimatePresence mode="popLayout">
                          {filteredTransactions.slice(0, 5).map((t) => (
                            <TransactionItem 
                              key={t.id} 
                              t={t} 
                              deleteTransaction={deleteTransaction} 
                              privacyMode={settings.privacyMode} 
                              onClick={() => setSelectedTransaction(t)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                      {filteredTransactions.length > 0 && futureTransactions.length === 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0F111A] via-[#0F111A]/80 to-transparent pointer-events-none z-10" />
                      )}
                    </div>
                  </section>

                  {futureTransactions.length > 0 && (
                    <section className="mt-8">
                      <div className="flex justify-between items-center mb-4">
                        <h3 
                          className="font-bold text-lg cursor-pointer hover:text-primary transition-colors"
                          onClick={() => {
                            setSelectedHistoryCategory('Futuros');
                            setActiveTab('history');
                          }}
                        >
                          Lançamentos futuros
                        </h3>
                      </div>
                      <div className="relative">
                        <div className="space-y-3 pb-6">
                          <AnimatePresence mode="popLayout">
                            {futureTransactions.slice(0, 5).map((t) => (
                              <TransactionItem 
                                key={t.id} 
                                t={t} 
                                deleteTransaction={deleteTransaction} 
                                privacyMode={settings.privacyMode} 
                                onClick={() => setSelectedTransaction(t)}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                        {futureTransactions.length > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0F111A] via-[#0F111A]/80 to-transparent pointer-events-none z-10" />
                        )}
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          );
        } catch (e) {
          console.error("Dashboard render error:", e);
          return <div className="p-6 bg-rose-500/10 text-rose-500 rounded-2xl">Erro ao carregar o dashboard.</div>;
        }
      })()}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div initial={{ opacity: 1 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Extrato {selectedMonth.toLocaleDateString('pt-BR', { month: 'long' }).charAt(0).toUpperCase() + selectedMonth.toLocaleDateString('pt-BR', { month: 'long' }).slice(1)}</h2>
                <select 
                  value={selectedHistoryCategory}
                  onChange={(e) => setSelectedHistoryCategory(e.target.value)}
                  className="bg-[#1C1F2B] text-xs font-bold p-2 rounded-xl border border-slate-800 outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Todas">Todas Categorias</option>
                  <option value="Futuros">Lançamentos Futuros</option>
                  {Object.keys(CATEGORIES).filter(cat => {
                    // Only show categories that have transactions in the current month
                    return extratoTransactions.some(t => t.category === cat);
                  }).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-6">
                {(() => {
                  const displayedTransactions = selectedHistoryCategory === 'Futuros' 
                    ? futureTransactions 
                    : extratoTransactions.filter(t => selectedHistoryCategory === 'Todas' || t.category === selectedHistoryCategory);

                  if (displayedTransactions.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-slate-600 mb-4">
                          <History size={32} />
                        </div>
                        <p className="text-slate-500 font-bold">Sem lançamentos</p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                          {displayedTransactions.map((t) => (
                            <TransactionItem 
                              key={t.id} 
                              t={t} 
                              deleteTransaction={deleteTransaction} 
                              privacyMode={settings.privacyMode} 
                              onClick={() => setSelectedTransaction(t)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>

                      {/* Summary at the end of the list */}
                      <div className="mt-8 pb-12">
                        <div className="flex justify-between items-start">
                          {selectedHistoryCategory === 'Todas' ? (
                            <>
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ganhos</p>
                                <p className="text-xl font-black text-emerald-500">
                                  {formatCurrency(settings.incomes.reduce((acc, curr) => acc + curr.value, 0))}
                                </p>
                              </div>
                              <div className="text-right space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Gastos</p>
                                <p className="text-xl font-black text-white">
                                  {formatCurrency(extratoTransactions.filter(t => t.type === 'expense' && t.category !== 'Cartão').reduce((acc, curr) => acc + curr.amount, 0))}
                                </p>
                                {(() => {
                                  const totalInc = settings.incomes.reduce((acc, curr) => acc + curr.value, 0);
                                  const totalExp = extratoTransactions.filter(t => t.type === 'expense' && t.category !== 'Cartão').reduce((acc, curr) => acc + curr.amount, 0);
                                  const diff = totalInc - totalExp;
                                  return (
                                    <p className={`text-[10px] font-bold ${diff >= 0 ? 'text-primary/60' : 'text-rose-500/60'} uppercase tracking-widest`}>
                                      {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                                    </p>
                                  );
                                })()}
                              </div>
                            </>
                          ) : (
                            <div className="w-full text-right">
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                  {selectedHistoryCategory === 'Futuros' ? 'Total Futuro' : `Total em ${selectedHistoryCategory}`}
                                </p>
                                <p className="text-2xl font-black text-white">
                                  {formatCurrency(displayedTransactions.reduce((acc, curr) => acc + curr.amount, 0))}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          )}

          {hasVisitedLukinho && (
            <div style={{ display: activeTab === 'goals' ? 'block' : 'none' }}>
              <motion.div 
                initial={{ opacity: 1 }} 
                animate={{ opacity: 1 }} 
                className="max-w-md mx-auto"
                onViewportEnter={() => {
                  try {
                    localStorage.setItem('lastLukinhoVisit', new Date().toDateString());
                  } catch (e) {
                    console.warn('LocalStorage not available');
                  }
                }}
              >
                <LukinhoSincero 
                  transactions={transactions} 
                  settings={settings} 
                  userName={user?.displayName?.split(' ')[0]} 
                  onChatComplete={(finished) => setChatFinished(finished)}
                  skipAnimation={chatFinished}
                />

              {chatFinished && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  {(() => {
                    const currentMonthExpenses = transactions.filter(t => 
                      t.type === 'expense' && 
                      new Date(t.date).getMonth() === selectedMonth.getMonth() &&
                      new Date(t.date).getFullYear() === selectedMonth.getFullYear()
                    );

                    const categories: { [key: string]: number } = {};
                    currentMonthExpenses.forEach(t => {
                      categories[t.category] = (categories[t.category] || 0) + t.amount;
                    });
                    
                    const total = currentMonthExpenses.reduce((acc, curr) => acc + curr.amount, 0);
                    
                    const categoryData = Object.entries(categories)
                      .map(([name, value]) => ({ name, value }))
                      .filter(item => total > 0 && Math.round((item.value / total) * 100) > 0)
                      .sort((a, b) => b.value - a.value);

                    const COLORS = ['#cdfc54', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#10b981'];

                    return (
                      <>
                        <div className="h-[260px] w-full relative">
                          <ResponsiveContainer width="99%" height={260} debounce={50}>
                            <PieChart>
                              <Pie
                                data={categoryData}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={110}
                                paddingAngle={8}
                                dataKey="value"
                                stroke="none"
                                isAnimationActive={true}
                              >
                                {categoryData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total</p>
                            <p className="text-2xl font-black text-white">
                              {formatCurrency(total)}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3 mt-6 mb-4 relative">
                          {categoryData.map((item) => (
                            <div 
                              key={item.name} 
                              onClick={() => {
                                setSelectedHistoryCategory(item.name);
                                setActiveTab('history');
                              }}
                              className="flex items-center justify-between p-4 bg-[#1C1F2B] rounded-[20px] border border-slate-800/50 active:scale-[0.98] transition-transform cursor-pointer"
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${CATEGORIES[item.name]?.color || 'bg-slate-800 text-slate-400'}`}>
                                  {CATEGORIES[item.name]?.icon || <MoreHorizontal size={18} />}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-white">{item.name}</p>
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    {total > 0 ? Math.round((item.value / total) * 100) : 0}% do total
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-black text-white">{formatCurrency(item.value)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </motion.div>
              )}
            </motion.div>
          </div>
          )}

          {activeTab === 'more' && (
            <motion.div 
              initial={{ opacity: 1, y: 0 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="space-y-4 pb-12"
            >
              <div className="bg-[#1C1F2B] rounded-[32px] overflow-hidden border border-slate-800/50">
                <SettingsAccordion 
                  title="Minhas Rendas" 
                  icon={<Wallet size={20} />}
                  isOpen={openedAccordion === 'incomes'}
                  onToggle={() => setOpenedAccordion(openedAccordion === 'incomes' ? null : 'incomes')}
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {settings.incomes.map((income) => (
                        <div key={income.id} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
                              <ArrowUpRight size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-bold">{income.label}</p>
                              <p className="text-[10px] text-slate-500">{formatCurrency(income.value)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setEditingIncome(income)}
                              className="p-2 text-slate-500 hover:text-white transition-colors"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => removeIncomeSource(income.id)}
                              className="p-2 text-slate-500 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <button 
                      onClick={addIncomeSource}
                      className="w-full py-3 border border-dashed border-slate-700 rounded-xl text-slate-500 text-sm font-bold hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus size={16} />
                      Adicionar Renda
                    </button>
                  </div>
                </SettingsAccordion>

                <SettingsAccordion 
                  title="Meus Cartões" 
                  icon={<CreditCard size={20} />}
                  isOpen={openedAccordion === 'cards'}
                  onToggle={() => setOpenedAccordion(openedAccordion === 'cards' ? null : 'cards')}
                >
                  <div className="space-y-4">
                    <Reorder.Group axis="y" values={cards} onReorder={updateCardsOrder} className="space-y-2">
                      {cards.map((card) => (
                        <Reorder.Item 
                          key={card.id} 
                          value={card}
                          className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white`} style={{ backgroundColor: card.color }}>
                              <CreditCard size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-bold">{card.name}</p>
                              <p className="text-[10px] text-slate-500">Final {card.lastFour} • Vence dia {card.dueDay}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setEditingCard(card)}
                              className="p-2 text-slate-500 hover:text-white transition-colors"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => deleteCard(card.id)}
                              className="p-2 text-slate-500 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                    
                    <button 
                      onClick={() => setIsCardModalOpen(true)}
                      className="w-full py-3 border border-dashed border-slate-700 rounded-xl text-slate-500 text-sm font-bold hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus size={16} />
                      Novo Cartão
                    </button>
                  </div>
                </SettingsAccordion>

                <SettingsAccordion 
                  title="Meta de Gastos" 
                  icon={<Target size={20} />}
                  isOpen={openedAccordion === 'budget'}
                  onToggle={() => setOpenedAccordion(openedAccordion === 'budget' ? null : 'budget')}
                >
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-bold text-slate-400">Limite Mensal</span>
                        <span className="text-xl font-black text-primary">{formatCurrency(settings.monthlyLimit || stats.totalIncome)}</span>
                      </div>
                      <div className="relative h-2 flex items-center">
                        <div className="absolute inset-0 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary/30 transition-all duration-500"
                            style={{ width: `${Math.min(100, ((settings.monthlyLimit || stats.totalIncome) / (stats.totalIncome || 1)) * 100)}%` }}
                          />
                        </div>
                        <input 
                          type="range"
                          min="0"
                          max={stats.totalIncome || 10000}
                          step="50"
                          value={settings.monthlyLimit || stats.totalIncome}
                          onChange={(e) => updateSettings({ monthlyLimit: parseInt(e.target.value) })}
                          className="absolute inset-0 w-full h-2 bg-transparent appearance-none cursor-pointer accent-primary z-10"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-4 leading-relaxed">
                        Este valor será usado para calcular sua barra de progresso no dashboard e ajudar no controle de gastos.
                      </p>
                    </div>
                  </div>
                </SettingsAccordion>

                <SettingsAccordion 
                  title="Duo (Compartilhar)" 
                  icon={<Users size={20} />}
                  isOpen={openedAccordion === 'duo'}
                  onToggle={() => setOpenedAccordion(openedAccordion === 'duo' ? null : 'duo')}
                >
                  <div className="space-y-4">
                    {settings.familyId ? (
                      <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center text-primary">
                            <Heart size={16} />
                          </div>
                          <p className="text-sm font-bold text-primary">Duo Ativo</p>
                        </div>
                        <p className="text-xs text-primary/70">
                          Você está compartilhando suas finanças com: <br/>
                          <span className="font-bold">{settings.duoEmail}</span>
                        </p>
                      </div>
                    ) : settings.pendingInvite ? (
                      <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                        <p className="text-sm font-bold text-amber-500 mb-2">Convite Pendente</p>
                        <p className="text-xs text-amber-500/70 mb-4">
                          {settings.pendingInvite} convidou você para compartilhar as finanças.
                        </p>
                        <button 
                          onClick={acceptInvite}
                          className="w-full py-3 bg-amber-500 text-[#0f111a] font-bold rounded-xl text-sm active:scale-95 transition-transform"
                        >
                          Aceitar Convite
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Convide seu parceiro(a) para que tudo que um fizer na conta, altere na do outro em tempo real.
                        </p>
                        <div className="flex gap-2">
                          <input 
                            id="spouse-email-input"
                            type="email"
                            placeholder="E-mail do parceiro(a)"
                            defaultValue={settings.duoEmail || settings.pendingInvite || ''}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors min-w-0"
                          />
                          <button 
                            onClick={() => {
                              const input = document.getElementById('spouse-email-input') as HTMLInputElement;
                              if (input?.value) {
                                inviteSpouse(input.value);
                                input.value = '';
                              }
                            }}
                            className="w-11 h-11 bg-primary text-on-primary font-bold rounded-xl flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
                          >
                            {settings.duoEmail || settings.pendingInvite ? <Edit2 size={20} /> : <Plus size={20} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </SettingsAccordion>

                <SettingsAccordion 
                  title="Notificações" 
                  icon={<Bell size={20} />}
                  isOpen={openedAccordion === 'notifications'}
                  onToggle={() => setOpenedAccordion(openedAccordion === 'notifications' ? null : 'notifications')}
                >
                  <div className="space-y-4 text-left">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                          <Smartphone size={20} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold">Notificações Push</p>
                          <p className="text-[10px] text-slate-500">Alertas de vencimento no celular</p>
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          if (typeof Notification === 'undefined') {
                            alert('Seu navegador não suporta notificações.');
                            return;
                          }
                          const newValue = !settings.pushNotifications;
                          if (newValue && Notification.permission !== 'granted') {
                            const permission = await Notification.requestPermission();
                            if (permission !== 'granted') {
                              alert('Por favor, habilite as notificações no seu navegador para receber alertas.');
                              return;
                            }
                          }
                          updateSettings({ pushNotifications: newValue });
                        }}
                        className={`w-12 h-6 rounded-full transition-colors relative ${settings.pushNotifications ? 'bg-primary' : 'bg-slate-700'}`}
                      >
                        <motion.div 
                          animate={{ x: settings.pushNotifications ? 26 : 4 }}
                          className={`absolute top-1 w-4 h-4 rounded-full ${settings.pushNotifications ? 'bg-[#0F111A]' : 'bg-white'}`}
                        />
                      </button>
                    </div>
                  </div>
                </SettingsAccordion>

                <SettingsAccordion 
                  title="Pix do Rolê" 
                  icon={<Share2 size={20} />}
                  isOpen={openedAccordion === 'pix'}
                  onToggle={() => setOpenedAccordion(openedAccordion === 'pix' ? null : 'pix')}
                >
                  <div className="space-y-4 text-left">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Cadastre sua chave Pix para gerar mensagens de cobrança automática ao dividir contas.
                    </p>
                    <div className="flex gap-2">
                      <input 
                        id="pix-key-input"
                        type="text"
                        placeholder="Sua chave Pix"
                        defaultValue={settings.pixKey || ''}
                        disabled={!!settings.pixKey && !isEditingPixKey}
                        className={`flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors min-w-0 ${!!settings.pixKey && !isEditingPixKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                      <button 
                        onClick={() => {
                          if (!!settings.pixKey && !isEditingPixKey) {
                            setIsEditingPixKey(true);
                            const input = document.getElementById('pix-key-input') as HTMLInputElement;
                            if (input) input.focus();
                            return;
                          }
                          
                          const input = document.getElementById('pix-key-input') as HTMLInputElement;
                          if (input?.value) {
                            updateSettings({ pixKey: input.value });
                            setIsEditingPixKey(false);
                          }
                        }}
                        className="w-11 h-11 bg-primary text-on-primary font-bold rounded-xl flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
                      >
                        {settings.pixKey && !isEditingPixKey ? <Edit2 size={20} /> : <Plus size={20} />}
                      </button>
                    </div>
                  </div>
                </SettingsAccordion>

                {deferredPrompt && (
                  <SettingsAccordion 
                    title="Instalar App" 
                    icon={<Download size={20} />}
                    isOpen={openedAccordion === 'install'}
                    onToggle={() => setOpenedAccordion(openedAccordion === 'install' ? null : 'install')}
                  >
                    <div className="space-y-4 text-left">
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Instale o Luko na sua tela de início para acesso rápido e melhor experiência.
                      </p>
                      <button 
                        onClick={handleInstallClick}
                        className="w-full py-4 bg-primary text-on-primary font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                      >
                        <Download size={20} />
                        Instalar Agora
                      </button>
                    </div>
                  </SettingsAccordion>
                )}
              </div>

              <div className="px-4 pt-4">
                <button 
                  onClick={handleLogout}
                  className="w-full py-4 bg-rose-500/10 text-rose-500 font-bold rounded-2xl flex items-center justify-center gap-2 border border-rose-500/20 active:scale-95 transition-transform"
                >
                  <LogOut size={20} />
                  Sair da conta
                </button>
              </div>
            </motion.div>
          )}
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[#0F111A]/80 backdrop-blur-md border-t border-slate-800/50 px-6 py-4 pb-6 z-40">
          <div className="max-w-md mx-auto flex justify-between items-center relative">
            <NavButton 
              active={activeTab === 'dashboard'} 
              onClick={() => handleTabChange('dashboard')} 
              icon={<LayoutDashboard size={20} />} 
              label="Início" 
            />
            <NavButton active={activeTab === 'history'} onClick={() => handleTabChange('history')} icon={<History size={20} />} label="Extrato" />
            <div className="absolute left-1/2 -translate-x-1/2 -top-8">
              <button onClick={() => setIsModalOpen(true)} className="w-14 h-14 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/20">
                <Plus size={28} strokeWidth={3} />
              </button>
            </div>
            <div className="w-12" />
            <NavButton 
              active={activeTab === 'goals'} 
              onClick={() => handleTabChange('goals')} 
              icon={<Sparkles size={20} />} 
              label="Lukinho" 
            />
            <NavButton active={activeTab === 'more'} onClick={() => handleTabChange('more')} icon={<SettingsIcon size={20} />} label="Ajustes" />
          </div>
        </nav>

        {/* Modals */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="bg-[#1C1F2B] w-full sm:max-w-md sm:rounded-[32px] rounded-t-[32px] p-8 relative z-10 shadow-2xl border border-slate-800/50">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Nova Transação</h2>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-full"><X size={20} /></button>
                </div>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const formData = new FormData(form);
                  
                  const category = formData.get('category') as string;
                  const customCategory = formData.get('customCategory') as string;
                  const finalCategory = category === 'Outros' && customCategory ? customCategory : category;
                  
                  const installmentsCount = finalCategory === 'Parcela' ? parseInt(formData.get('installmentsCount') as string) || 1 : undefined;
                  const peopleCount = finalCategory === 'Pix do Rolê' ? parseInt(formData.get('peopleCount') as string) || 1 : undefined;
                  const cardId = formData.get('cardId') as string || undefined;
                  const dueDay = cardId ? undefined : ((finalCategory === 'Parcela' || finalCategory === 'Mensalidade' || finalCategory === 'Assinatura') ? parseInt(formData.get('dueDay') as string) || undefined : undefined);
                  
                  await addTransaction({
                    title: formData.get('title') as string,
                    amount: parseCurrencyInput(formData.get('amount') as string),
                    type: 'expense',
                    category: finalCategory,
                    cardId: cardId,
                    installmentsCount: installmentsCount,
                    dueDay: dueDay,
                    peopleCount: peopleCount
                  } as any);
                  setIsModalOpen(false);
                }} className="space-y-4">
                  <input name="title" required className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary" placeholder="Título" />
                  
                  <select 
                    name="cardId" 
                    value={newTransCardId}
                    className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary"
                    onChange={(e) => setNewTransCardId(e.target.value)}
                  >
                    <option value="">Saldo em conta</option>
                    {cards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}
                  </select>

                  <div className="w-full">
                    <MoneyInput name="amount" value={0} className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary" placeholder="0,00" />
                  </div>
                  
                  <select 
                    name="category" 
                    value={newTransCategory}
                    className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary"
                    onChange={(e) => setNewTransCategory(e.target.value)}
                  >
                    {Object.keys(CATEGORIES)
                      .filter(cat => cat !== 'Pix do Rolê' || settings.pixKey)
                      .map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>

                  {newTransCategory === 'Outros' && (
                    <input 
                      name="customCategory" 
                      required 
                      className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary" 
                      placeholder="Nome da nova categoria" 
                    />
                  )}

                  {newTransCategory === 'Pix do Rolê' && (
                    <div className="w-full">
                      <select 
                        name="peopleCount" 
                        required
                        className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Dividir em quantas pessoas?</option>
                        {[2, 3, 4, 5, 6, 7, 8].map(num => (
                          <option key={num} value={num}>{num} pessoas</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className={`${(newTransCategory === 'Parcela' || newTransCategory === 'Mensalidade' || newTransCategory === 'Assinatura') && !newTransCardId ? 'grid grid-cols-2' : 'block'} gap-4`}>
                    {newTransCategory === 'Parcela' && (
                      <div className="w-full">
                        <select 
                          name="installmentsCount" 
                          className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Nº Parcelas</option>
                          {[...Array(12)].map((_, i) => (
                            <option key={i+1} value={i+1}>{i+1}x</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {(newTransCategory === 'Parcela' || newTransCategory === 'Mensalidade' || newTransCategory === 'Assinatura') && !newTransCardId && (
                      <div className="w-full">
                        <select 
                          name="dueDay" 
                          className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Dia Venc.</option>
                          {[...Array(31)].map((_, i) => (
                            <option key={i+1} value={i+1}>{i+1}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <button 
                    type="submit" 
                    className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 mt-4 active:opacity-80 transition-opacity"
                  >
                    Salvar
                  </button>
                </form>
              </motion.div>
            </div>
          )}

          {pixShareData && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setPixShareData(null)} 
                className="absolute inset-0 bg-black/80 backdrop-blur-md" 
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#1C1F2B] w-full max-w-sm rounded-[40px] p-8 relative z-10 shadow-2xl border border-slate-800 text-center"
              >
                <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center text-emerald-500 mx-auto mb-6">
                  <Share2 size={40} />
                </div>
                <h3 className="text-2xl font-black mb-4">Pix do Rolê!</h3>
                <p className="text-slate-400 mb-8 leading-relaxed">
                  A conta deu <span className="text-white font-bold">{formatCurrency(pixShareData.amountPerPerson)}</span> para cada um.
                </p>
                
                <div className="bg-[#0F111A] p-4 rounded-2xl mb-8 text-left border border-slate-800">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Mensagem para o WhatsApp</p>
                  <p className="text-sm text-slate-300 italic">
                    "Galera, a conta deu {formatCurrency(pixShareData.amountPerPerson)} pra cada. Meu Pix é {pixShareData.pixKey}"
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      const message = `Galera, a conta deu ${formatCurrency(pixShareData.amountPerPerson)} pra cada. Meu Pix é ${pixShareData.pixKey}`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
                      setPixShareData(null);
                    }}
                    className="w-full bg-emerald-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    Compartilhar no WhatsApp
                  </button>
                  <button 
                    onClick={() => setPixShareData(null)}
                    className="w-full bg-slate-800 text-white font-bold py-4 rounded-2xl active:scale-95 transition-transform"
                  >
                    Agora não
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {isCardModalOpen && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCardModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="bg-[#1C1F2B] w-full sm:max-w-md sm:rounded-[32px] rounded-t-[32px] p-8 relative z-10 shadow-2xl border border-slate-800/50">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Novo Cartão</h2>
                  <button onClick={() => setIsCardModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-full"><X size={20} /></button>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  addCard({
                    name: formData.get('name') as string,
                    limit: parseCurrencyInput(formData.get('limit') as string),
                    color: formData.get('color') as string,
                    dueDay: (formData.get('dueDay') && formData.get('dueDay') !== "") ? parseInt(formData.get('dueDay') as string) : undefined,
                  });
                }} className="space-y-4">
                  <input name="name" required className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary" placeholder="Nome do Cartão (ex: Nubank)" />
                  <div className="grid grid-cols-2 gap-4">
                    <MoneyInput name="limit" value={0} className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary" placeholder="Limite Total" />
                    <select name="dueDay" className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary">
                      <option value="">Dia Venc.</option>
                      {[...Array(31)].map((_, i) => (
                        <option key={i+1} value={i+1}>{i+1}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {CARD_COLORS.map(color => (
                      <label key={color.value} className="relative cursor-pointer">
                        <input type="radio" name="color" value={color.value} className="peer sr-only" defaultChecked={color.name === 'Roxo'} />
                        <div className={`h-12 rounded-xl ${color.value} border-4 border-transparent peer-checked:border-white shadow-sm`} />
                      </label>
                    ))}
                  </div>
                  <button type="submit" className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 mt-4">Adicionar Cartão</button>
                </form>
              </motion.div>
            </div>
          )}

          {isNotificationOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsNotificationOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <motion.div 
                initial={{ y: "-100%" }} 
                animate={{ y: 0 }} 
                exit={{ y: "-100%" }} 
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="bg-[#1C1F2B] w-full sm:max-w-md rounded-b-[32px] p-8 relative z-10 shadow-2xl border border-slate-800/50"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Notificações</h2>
                  <button onClick={() => setIsNotificationOpen(false)} className="p-2 hover:bg-slate-800 rounded-full"><X size={20} /></button>
                </div>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <Bell size={40} className="mx-auto mb-4 opacity-20" />
                      <p>Tudo limpo por aqui!</p>
                    </div>
                  ) : (
                    notifications.map(n => (
                      <NotificationItem 
                        key={n.id}
                        n={n}
                        onRead={(id) => {
                          const newReadIds = Array.from(new Set([...(settings.readNotificationIds || []), id]));
                          updateSettings({ readNotificationIds: newReadIds });
                        }}
                        onClick={() => {
                          if (n.transactionId) {
                            const trans = transactions.find(t => t.id === n.transactionId);
                            if (trans) {
                              setEditingTransaction(trans);
                              setIsNotificationOpen(false);
                            }
                          }
                        }}
                      />
                    ))
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Month Picker Modal */}
        <AnimatePresence>
          {isMonthPickerOpen && (
            <div className="fixed inset-0 z-[60] flex items-start justify-center px-0">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setIsMonthPickerOpen(false)} 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ y: -100, opacity: 0 }} 
                animate={{ y: 0, opacity: 1 }} 
                exit={{ y: -100, opacity: 0 }}
                className="bg-[#1C1F2B] w-full max-w-md rounded-b-[32px] p-6 relative z-10 shadow-2xl border border-slate-800/50"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg">Selecionar Mês</h3>
                  <button onClick={() => setIsMonthPickerOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const date = new Date(selectedMonth.getFullYear(), i, 1);
                    const isSelected = selectedMonth.getMonth() === i;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedMonth(date);
                          setIsMonthPickerOpen(false);
                        }}
                        className={`py-4 rounded-2xl text-sm font-bold transition-all ${
                          isSelected 
                            ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' 
                            : 'bg-[#0F111A] text-slate-400 hover:text-white border border-slate-800/50'
                        }`}
                      >
                        {date.toLocaleString('pt-BR', { month: 'short' }).replace('.', '')}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6 pt-6 border-t border-slate-800/50 flex justify-between items-center">
                  <button 
                    onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear() - 1, selectedMonth.getMonth()))}
                    className="p-2 text-slate-500 hover:text-white"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="font-black text-xl">{selectedMonth.getFullYear()}</span>
                  <button 
                    onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear() + 1, selectedMonth.getMonth()))}
                    className="p-2 text-slate-500 hover:text-white"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Transaction Detail Modal */}
        <AnimatePresence>
          {selectedTransaction && (
            <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setSelectedTransaction(null)} 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ y: "100%", opacity: 0 }} 
                animate={{ y: 0, opacity: 1 }} 
                exit={{ y: "100%", opacity: 0 }}
                className="bg-[#1C1F2B] w-full sm:max-w-md rounded-t-[40px] sm:rounded-[40px] p-6 pb-10 relative z-10 shadow-2xl border-t border-x border-slate-800 sm:border"
              >
                <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-6 sm:hidden" />
                
                <div className="flex flex-col items-center text-center mb-6">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 ${CATEGORIES[selectedTransaction.category]?.color || 'bg-slate-800 text-slate-400'}`}>
                    {getInteractiveIcon(selectedTransaction.title, selectedTransaction.category)}
                  </div>
                  <h3 className="text-xl font-black mb-1">{selectedTransaction.title}</h3>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">{selectedTransaction.category}</p>
                </div>

                <div className="space-y-2 mb-6">
                  <div 
                    onClick={() => {
                      setEditingTransaction(selectedTransaction);
                      setSelectedTransaction(null);
                    }}
                    className="flex justify-between items-center py-2 border-b border-slate-800/50 cursor-pointer hover:bg-white/5 transition-colors px-1 -mx-1 rounded-lg"
                  >
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Valor</span>
                    <span className={`text-sm font-bold ${selectedTransaction.type === 'income' ? 'text-emerald-500' : 'text-white'}`}>
                      {formatCurrency(selectedTransaction.amount)}
                    </span>
                  </div>
                  
                  <div 
                    onClick={() => {
                      setEditingTransaction(selectedTransaction);
                      setSelectedTransaction(null);
                    }}
                    className="flex justify-between items-center py-2 border-b border-slate-800/50 cursor-pointer hover:bg-white/5 transition-colors px-1 -mx-1 rounded-lg"
                  >
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Data</span>
                    <span className="text-sm font-bold">{selectedTransaction.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                  </div>

                  {selectedTransaction.installmentsCount && selectedTransaction.installmentsCount > 1 && (
                    <>
                      <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                        <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Parcela</span>
                        <span className="text-sm font-bold">{selectedTransaction.installmentIndex} de {selectedTransaction.installmentsCount}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                        <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Valor Total</span>
                        <span className="text-sm font-bold">{formatCurrency(selectedTransaction.totalAmount || (selectedTransaction.amount * selectedTransaction.installmentsCount))}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                        <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Restante</span>
                        <span className="text-sm font-bold text-rose-500">
                          {formatCurrency((selectedTransaction.totalAmount || (selectedTransaction.amount * selectedTransaction.installmentsCount)) - (selectedTransaction.amount * (selectedTransaction.installmentIndex || 1)))}
                        </span>
                      </div>
                    </>
                  )}

                  {selectedTransaction.cardId && (
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                      <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Cartão</span>
                      <span className="text-sm font-bold">{cards.find(c => c.id === selectedTransaction.cardId)?.name || 'Desconhecido'}</span>
                    </div>
                  )}

                  {selectedTransaction.location && (
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50 cursor-pointer hover:bg-white/5 transition-colors px-1 -mx-1 rounded-lg"
                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${selectedTransaction.location?.lat},${selectedTransaction.location?.lng}`, '_blank')}
                    >
                      <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Localização</span>
                      <span className="text-sm font-bold text-slate-300 max-w-[150px] text-right truncate">{selectedTransaction.location.address}</span>
                    </div>
                  )}

                  {selectedTransaction.category === 'Pix do Rolê' && (selectedTransaction.pixKey || settings.pixKey) && (
                    <div className="mt-4 p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 space-y-3">
                      <p className="text-[10px] text-slate-400 leading-relaxed italic text-center">
                        "Galera, a conta deu {formatCurrency(selectedTransaction.amount)} pra cada. Meu Pix é {selectedTransaction.pixKey || settings.pixKey}"
                      </p>
                      <button 
                        onClick={() => {
                          const message = `Galera, a conta deu ${formatCurrency(selectedTransaction.amount)} pra cada. Meu Pix é ${selectedTransaction.pixKey || settings.pixKey}`;
                          const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
                          window.open(url, '_blank');
                        }}
                        className="w-full py-3 bg-emerald-500 text-on-primary text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
                      >
                        <Share2 size={14} />
                        Compartilhar Pix
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => setSelectedTransaction(null)}
                    className="w-full bg-[#0F111A] text-white font-bold py-4 rounded-2xl border border-slate-800 hover:bg-[#151825] transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Transaction Modal */}
        <AnimatePresence>
          {editingTransaction && (
            <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setEditingTransaction(null)} 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ y: 100, opacity: 0 }} 
                animate={{ y: 0, opacity: 1 }} 
                exit={{ y: 100, opacity: 0 }}
                className="bg-[#1C1F2B] w-full max-w-sm rounded-t-[40px] sm:rounded-[40px] p-8 relative z-10 shadow-2xl border border-slate-800"
              >
                <h3 className="text-xl font-black mb-6">Editar Transação</h3>
                <div className="space-y-4 mb-8">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Título</label>
                    <input 
                      type="text" 
                      value={editingTransaction.title}
                      onChange={(e) => setEditingTransaction({ ...editingTransaction, title: e.target.value })}
                      className="w-full bg-[#0F111A] border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Valor</label>
                    <MoneyInput 
                      value={editingTransaction.amount}
                      onChange={(val) => setEditingTransaction({ ...editingTransaction, amount: val })}
                      className="w-full bg-[#0F111A] border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setEditingTransaction(null)}
                    className="flex-1 bg-slate-800 text-white font-bold py-4 rounded-2xl"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      updateTransaction(editingTransaction.id, { 
                        title: editingTransaction.title, 
                        amount: editingTransaction.amount
                      });
                      setEditingTransaction(null);
                    }}
                    className="flex-1 bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-lg shadow-primary/20"
                  >
                    Salvar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Card Modal */}
        <AnimatePresence>
          {editingCard && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setEditingCard(null)} 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#1C1F2B] w-full max-w-sm rounded-[40px] p-8 relative z-10 shadow-2xl border border-slate-800"
              >
                <h3 className="text-xl font-black mb-6">Editar Cartão</h3>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  updateCard(editingCard.id, {
                    name: formData.get('name') as string,
                    limit: parseFloat(formData.get('limit') as string),
                    dueDay: parseInt(formData.get('dueDay') as string),
                    color: formData.get('color') as string
                  });
                }} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Nome do Cartão</label>
                    <input 
                      name="name"
                      type="text" 
                      defaultValue={editingCard.name}
                      className="w-full bg-[#0F111A] border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Limite</label>
                    <input 
                      name="limit"
                      type="number" 
                      defaultValue={editingCard.limit}
                      className="w-full bg-[#0F111A] border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Dia do Vencimento</label>
                    <select 
                      name="dueDay"
                      defaultValue={editingCard.dueDay}
                      className="w-full bg-[#0F111A] border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {[...Array(31)].map((_, i) => (
                        <option key={i+1} value={i+1}>{i+1}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {CARD_COLORS.map(color => (
                      <label key={color.value} className="relative cursor-pointer">
                        <input type="radio" name="color" value={color.value} className="peer sr-only" defaultChecked={color.value === editingCard.color} />
                        <div className={`h-12 rounded-xl ${color.value} border-4 border-transparent peer-checked:border-white shadow-sm`} />
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button 
                      type="button"
                      onClick={() => setEditingCard(null)}
                      className="flex-1 bg-slate-800 text-white font-bold py-4 rounded-2xl"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-lg shadow-primary/20"
                    >
                      Salvar
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Income Modal */}
        <AnimatePresence>
          {editingIncome && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setEditingIncome(null)} 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#1C1F2B] w-full max-w-sm rounded-[40px] p-8 relative z-10 shadow-2xl border border-slate-800"
              >
                <h3 className="text-xl font-black mb-6">Editar Renda</h3>
                <div className="space-y-4 mb-8">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Nome da Renda</label>
                    <input 
                      type="text" 
                      value={editingIncome.label}
                      onChange={(e) => setEditingIncome({ ...editingIncome, label: e.target.value })}
                      className="w-full bg-[#0F111A] border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Valor Mensal</label>
                    <MoneyInput 
                      value={editingIncome.value}
                      onChange={(val) => setEditingIncome({ ...editingIncome, value: val })}
                      className="w-full bg-[#0F111A] border border-slate-800 rounded-2xl p-4 text-white outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setEditingIncome(null)}
                    className="flex-1 bg-slate-800 text-white font-bold py-4 rounded-2xl"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      updateIncomeSource(editingIncome.id, editingIncome.label, editingIncome.value);
                      setEditingIncome(null);
                    }}
                    className="flex-1 bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-lg shadow-primary/20"
                  >
                    Salvar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
    } catch (error) {
      console.error("Render error:", error);
      return (
        <div className="min-h-screen bg-[#0F111A] flex items-center justify-center p-6 text-center text-white">
          <div className="bg-[#1C1F2B] p-8 rounded-[32px] border border-slate-800 max-w-md w-full">
            <h2 className="text-xl font-bold mb-2">Ops! Algo deu errado</h2>
            <p className="text-slate-400 text-sm mb-6">Ocorreu um erro ao renderizar o aplicativo.</p>
            <button onClick={() => window.location.reload()} className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl">
              Recarregar
            </button>
          </div>
        </div>
      );
    }
  };

    console.log("App Rendering. isAuthReady:", isAuthReady, "User:", !!user);
    return (
      <ErrorBoundary>
        <GlobalErrorUI>
          {renderContent()}
          {/* Global Install Prompt for Mobile */}
          {!isStandalone && (
            <div className="fixed bottom-24 left-6 right-6 z-50">
              {deferredPrompt ? (
                <motion.div 
                  initial={{ y: 100, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="bg-primary text-on-primary p-4 rounded-2xl shadow-2xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Download size={20} />
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest">Instale o Luko</p>
                      <p className="text-[10px] opacity-80">Acesso rápido e offline</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      deferredPrompt.prompt();
                      deferredPrompt.userChoice.then((choiceResult: any) => {
                        if (choiceResult.outcome === 'accepted') {
                          console.log('User accepted the install prompt');
                        }
                        setDeferredPrompt(null);
                      });
                    }}
                    className="bg-on-primary text-primary px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                  >
                    Instalar
                  </button>
                </motion.div>
              ) : (
                /iPhone|iPad|iPod/.test(navigator.userAgent) && (
                  <motion.div 
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-[#1C1F2B] text-white p-4 rounded-2xl border border-slate-800 shadow-2xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Download size={20} className="text-primary" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest">Instale no iOS</p>
                        <p className="text-[10px] text-slate-400">Toque em Compartilhar e "Adicionar à Tela de Início"</p>
                      </div>
                    </div>
                    <div className="w-8 h-8 flex items-center justify-center">
                      <div className="w-1 h-1 bg-slate-500 rounded-full" />
                    </div>
                  </motion.div>
                )
              )}
            </div>
          )}
        </GlobalErrorUI>
      </ErrorBoundary>
    );
}

function NavButton({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-colors ${active ? 'text-primary' : 'text-slate-500'}`}>
      {icon}
      <span className="text-[10px] font-bold tracking-wider">{label}</span>
    </button>
  );
}

function SettingsAccordion({ title, icon, children, isOpen, onToggle }: { title: string, icon: React.ReactNode, children: React.ReactNode, isOpen: boolean, onToggle: () => void }) {
  return (
    <div className="border-b border-slate-800/50 overflow-hidden">
      <button 
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-primary">{icon}</div>
          <span className="font-bold text-sm uppercase tracking-widest text-slate-300">{title}</span>
        </div>
        {isOpen ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="p-6 pt-0">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
