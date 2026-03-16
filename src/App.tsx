/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, Component, ReactNode, ErrorInfo } from 'react';
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
  Heart
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
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  biometricsEnabled?: boolean;
  privacyMode?: boolean;
  readNotificationIds?: string[];
  familyId?: string;
  duoEmail?: string;
  pendingInvite?: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'info' | 'success';
  date: Date;
  category?: string;
}

// --- Helper for Currency Formatting ---
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const parseCurrencyInput = (value: string): number => {
  const cleanValue = value.replace(/\D/g, '');
  return Number(cleanValue) / 100;
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

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center text-white">
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
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center text-white">
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
  try {
    // Test connection to Firestore
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Firestore is offline. Please check your configuration and internet connection.");
    }
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
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

  return (
    <div className="relative overflow-hidden rounded-[20px]">
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
        onDragEnd={(_, info) => {
          if (info.offset.x < -60) {
            deleteTransaction(t.id);
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
          <p className={`font-bold text-sm ${t.type === 'income' ? 'text-emerald-500' : 'text-white'}`}>
            {t.type === 'income' ? '+' : '-'} {privacyMode ? '••••••' : formatCurrency(t.amount)}
          </p>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">
            {t.date instanceof Date ? t.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : ''}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

const TypingText = ({ text }: { text: string }) => {
  const [displayedText, setDisplayedText] = useState("");
  
  useEffect(() => {
    let i = 0;
    setDisplayedText("");
    const timer = setInterval(() => {
      setDisplayedText(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [text]);

  return <span>{displayedText}</span>;
};

const AIGoalsSummary = ({ transactions, settings }: { transactions: Transaction[], settings: UserSettings }) => {
  const [insight, setInsight] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateInsight = async () => {
      try {
        // Check cache
        const cached = localStorage.getItem('oracle_insight');
        const cachedTime = localStorage.getItem('oracle_insight_time');
        const now = new Date().getTime();
        
        if (cached && cachedTime && (now - parseInt(cachedTime)) < 8 * 60 * 60 * 1000) {
          setInsight(cached);
          setLoading(false);
          return;
        }

        const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.GEMINI_API_KEY : '';
        const ai = new GoogleGenAI({ apiKey: apiKey || '' });
        
        const totalIncome = settings.incomes.reduce((acc, curr) => acc + curr.value, 0);
        const totalExpenses = transactions
          .filter(t => t.type === 'expense' && new Date(t.date).getMonth() === new Date().getMonth())
          .reduce((acc, curr) => acc + curr.amount, 0);
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Analise estes dados financeiros: Renda R$${totalIncome}, Gastos R$${totalExpenses}. 
          Gere um insight financeiro CURTO (máximo 15 palavras), inteligente, motivador e com uma linguagem jovem/moderna. 
          Foque em encorajamento. Não use saudações.`
        });
        
        const newInsight = response.text || "Economizar é o novo hype. Continue focado!";
        setInsight(newInsight);
        localStorage.setItem('oracle_insight', newInsight);
        localStorage.setItem('oracle_insight_time', now.toString());
      } catch (error) {
        setInsight("Economizar é o novo hype. Continue focado!");
      } finally {
        setLoading(false);
      }
    };

    generateInsight();
  }, [transactions.length, settings.monthlyLimit]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-12"
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-primary" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Insight do Oráculo</span>
      </div>
      
      {loading ? (
        <div className="h-20 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-3xl font-black text-primary leading-tight tracking-tight"
        >
          <TypingText text={insight} />
        </motion.p>
      )}
    </motion.div>
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
    emailNotifications: false, 
    pushNotifications: true,
    biometricsEnabled: false,
    privacyMode: false,
    readNotificationIds: [] 
  });
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [openedAccordion, setOpenedAccordion] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingIncome, setEditingIncome] = useState<IncomeSource | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show custom install modal automatically if not already installed
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowInstallModal(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

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
  // --- Push Notifications Permission ---
  useEffect(() => {
    if (settings.pushNotifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [settings.pushNotifications]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  const [selectedHistoryCategory, setSelectedHistoryCategory] = useState<string>('Todas');

  const [newTransCategory, setNewTransCategory] = useState('Variados');
  const [newTransCardId, setNewTransCardId] = useState('');

  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setIsAuthReady(true);
      if (user) {
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
            emailNotifications: false,
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

    // Settings (always by UID)
    const unsubSettings = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const newSettings: UserSettings = {
          incomes: data.incomes || [],
          monthlyLimit: data.monthlyLimit || 0,
          emailNotifications: data.emailNotifications || false,
          pushNotifications: data.pushNotifications ?? true,
          biometricsEnabled: data.biometricsEnabled || false,
          privacyMode: data.privacyMode || false,
          readNotificationIds: data.readNotificationIds || [],
          familyId: data.familyId,
          duoEmail: data.duoEmail,
          pendingInvite: data.pendingInvite
        };
        setSettings(newSettings);

        // Now set up transactions and cards based on familyId or uid
        const targetId = data.familyId || user.uid;
        const idField = data.familyId ? 'familyId' : 'uid';

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

        // Cleanup previous listeners if targetId changed? 
        // Actually, onSnapshot returns a cleanup function.
        // But since this is inside another onSnapshot, it's tricky.
        // For simplicity, I'll just return the settings unsub.
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    return () => {
      unsubSettings();
    };
  }, [user]);

  // --- Actions ---
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  const addTransaction = async (t: Omit<Transaction, 'id' | 'uid' | 'date'>) => {
    if (!user) return;
    try {
      console.log('Adding transaction:', t);
      const baseDate = new Date();
      
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
      
      if (t.category === 'Parcela' && t.installmentsCount && t.installmentsCount > 1) {
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
            installmentsCount: t.installmentsCount
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
          isRecurring: t.category === 'Mensalidade' || t.category === 'Assinatura'
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
  const deleteTransaction = async (id: string) => {
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
    if (!user) return;
    try {
      await addDoc(collection(db, 'cards'), {
        ...c,
        uid: user.uid,
        familyId: settings.familyId,
        currentSpend: 0,
        order: cards.length
      });
      setIsCardModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'cards');
    }
  };

  const deleteCard = async (id: string) => {
    if (!user) return;
    if (!window.confirm('Tem certeza que deseja excluir este cartão?')) return;
    try {
      await deleteDoc(doc(db, 'cards', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `cards/${id}`);
    }
  };

  const updateCard = async (id: string, data: Partial<Card>) => {
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

    return transactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear && !t.isPaid;
    });
  }, [transactions, selectedMonth]);

  const extratoTransactions = useMemo(() => {
    const currentMonth = selectedMonth.getMonth();
    const currentYear = selectedMonth.getFullYear();

    return transactions.filter(t => {
      const tDate = new Date(t.date);
      const isSameMonth = tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
      
      // If it's a future month, also include recurring transactions
      const isFuture = currentYear > new Date().getFullYear() || (currentYear === new Date().getFullYear() && currentMonth > new Date().getMonth());
      if (isFuture && t.isRecurring) {
        return true;
      }
      
      return isSameMonth;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedMonth]);

  const billsDueToday = useMemo(() => {
    const today = new Date();
    const todayDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    today.setHours(0, 0, 0, 0);
    
    // Individual bills (not linked to cards)
    const individualBillsRaw = transactions.filter(t => {
      if (t.type !== 'expense' || t.isPaid || t.cardId) return false;
      
      // Only show recurring or installments as "bills" to pay
      // A "lançamento diário" (daily entry) like "Pastelaria" shouldn't be here
      const isBill = t.isRecurring || (t.installmentsCount && t.installmentsCount > 1);
      if (!isBill) return false;

      const tDate = new Date(t.date);
      tDate.setHours(0, 0, 0, 0);
      
      // Due today or in the past within the same month/year
      // If it's from a previous month and still unpaid, it's overdue
      const isSameMonthYear = tDate.getFullYear() === currentYear && tDate.getMonth() === currentMonth;
      const isPastMonthYear = tDate.getFullYear() < currentYear || (tDate.getFullYear() === currentYear && tDate.getMonth() < currentMonth);

      return (isSameMonthYear && tDate.getDate() <= todayDay) || isPastMonthYear;
    });

    const individualBills: any[] = [];
    individualBillsRaw.forEach(t => {
      const tDate = new Date(t.date);
      const isOverdue = tDate.getFullYear() < currentYear || 
                        (tDate.getFullYear() === currentYear && tDate.getMonth() < currentMonth) ||
                        (tDate.getFullYear() === currentYear && tDate.getMonth() === currentMonth && tDate.getDate() < todayDay);
      individualBills.push({ ...t, isCardBill: false, isOverdue });
    });

    // Card bills due today or overdue
    const cardBills = cards.filter(card => {
      if (!card.dueDay) return false;
      
      // If dueDay is today or has passed this month
      const isDueOrPast = card.dueDay <= todayDay;
      
      // Check if there are unpaid transactions for this card this month or previous months
      const unpaidTransactions = transactions.filter(t => 
        t.cardId === card.id && 
        t.type === 'expense' && 
        !t.isPaid &&
        (new Date(t.date).getFullYear() < currentYear || 
         (new Date(t.date).getFullYear() === currentYear && new Date(t.date).getMonth() <= currentMonth))
      );
      
      return isDueOrPast && unpaidTransactions.length > 0;
    }).map(card => {
      const isOverdue = card.dueDay! < todayDay;
      const unpaid = transactions.filter(t => {
        const tDate = new Date(t.date);
        return t.cardId === card.id && 
               t.type === 'expense' && 
               !t.isPaid &&
               (tDate.getFullYear() < currentYear || 
                (tDate.getFullYear() === currentYear && tDate.getMonth() <= currentMonth));
      });

      // Sum the amounts of unpaid transactions up to current month
      const amount = unpaid.reduce((acc, t) => acc + t.amount, 0);

      return {
        id: `card-bill-${card.id}`,
        cardId: card.id,
        title: `Fatura ${card.name}`,
        amount,
        category: 'Cartão',
        isCardBill: true,
        date: today,
        isOverdue
      };
    });

    return [...individualBills, ...cardBills].sort((a, b) => (b.isOverdue ? 1 : 0) - (a.isOverdue ? 1 : 0));
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
    const currentMonth = selectedMonth.getMonth();
    const currentYear = selectedMonth.getFullYear();

    const monthlyExpenses = transactions
      .filter(t => {
        const tDate = new Date(t.date);
        return t.type === 'expense' && 
               tDate.getMonth() === currentMonth && 
               tDate.getFullYear() === currentYear;
      })
      .reduce((acc, t) => acc + t.amount, 0);
    
    const totalIncome = settings.incomes.reduce((acc, i) => acc + i.value, 0);
    
    // Default limit to total income if not set
    const limit = settings.monthlyLimit || totalIncome;

    const available = Math.max(0, limit - monthlyExpenses);
    const progress = limit > 0 ? (monthlyExpenses / limit) * 100 : 0;

    return { totalIncome, expenses: monthlyExpenses, available, progress, limit };
  }, [transactions, settings, selectedMonth]);

  const notifications = useMemo(() => {
    const list: Notification[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Check due dates for all unpaid expenses
    transactions.forEach(t => {
      if (t.type === 'expense' && !t.isPaid) {
        const tDate = new Date(t.date);
        tDate.setHours(0, 0, 0, 0);
        
        if (tDate.getTime() === today.getTime()) {
          list.push({
            id: `today-${t.id}`,
            title: 'Vencimento Hoje',
            message: `A conta "${t.title}" vence hoje!`,
            type: 'warning',
            date: new Date(),
            category: t.category
          });
        } else if (tDate.getTime() < today.getTime()) {
          list.push({
            id: `overdue-${t.id}`,
            title: 'Conta Vencida',
            message: `A conta "${t.title}" está atrasada!`,
            type: 'warning',
            date: new Date(),
            category: t.category
          });
        } else if (tDate.getTime() === tomorrow.getTime()) {
          list.push({
            id: `tomorrow-${t.id}`,
            title: 'Vencimento Amanhã',
            message: `A conta "${t.title}" vence amanhã.`,
            type: 'info',
            date: new Date(),
            category: t.category
          });
        }
      }
    });

    // Check card limits
    cards.forEach(c => {
      const usage = (c.currentSpend / c.limit) * 100;
      if (usage >= 90) {
        list.push({
          id: `card-limit-${c.id}`,
          title: 'Cartão no Limite',
          message: `O cartão ${c.name} atingiu ${Math.round(usage)}% do limite!`,
          type: 'warning',
          date: new Date()
        });
      }
    });

    // Check global limit
    if (stats.progress >= 90) {
      list.push({
        id: 'global-limit',
        title: 'Orçamento Crítico',
        message: `Você já utilizou ${Math.round(stats.progress)}% do seu orçamento mensal!`,
        type: 'warning',
        date: new Date()
      });
    }

    return list.filter(n => !(settings.readNotificationIds || []).includes(n.id));
  }, [transactions, cards, stats, settings.readNotificationIds]);

  useEffect(() => {
    if (notifications.length > 0) {
      setNotificationsRead(false);
    } else {
      setNotificationsRead(true);
    }
  }, [notifications.length]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0F111A] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderContent = () => {
    if (!user) {
      return (
        <div className="min-h-screen bg-[#0F111A] flex flex-col items-center justify-center p-6 text-center text-white">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-sm w-full"
          >
            <div className="w-20 h-20 bg-primary rounded-[24px] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-primary/20">
              <Wallet className="text-on-primary" size={40} />
            </div>
            <h1 className="text-3xl font-bold mb-4 tracking-tight">Luko.</h1>
            <p className="text-slate-400 mb-12">Controle suas finanças de forma minimalista e sem atrito.</p>
            <button 
              onClick={handleLogin}
              className="w-full bg-[#1C1F2B] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 shadow-sm border border-slate-800 hover:bg-[#252936] transition-colors"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              Entrar com Google
            </button>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#0F111A] text-white font-sans pb-24">
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
                    updateSettings({ readNotificationIds: newReadIds });
                  }
                }}
                className="relative p-2 flex items-center justify-center"
              >
                <Bell size={20} className={notifications.length > 0 ? "text-white" : "text-slate-400"} />
                {!notificationsRead && notifications.length > 0 && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-600 rounded-full border-2 border-[#0F111A]" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="px-6 max-w-md mx-auto space-y-6">
          
          {activeTab === 'dashboard' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              
              {selectedCardId ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSelectedCardId(null)} className="p-2 bg-[#1C1F2B] rounded-full border border-slate-800">
                      <ArrowLeft size={20} />
                    </button>
                    <h2 className="text-xl font-bold">Detalhes do Cartão</h2>
                  </div>
                  
                  {cards.find(c => c.id === selectedCardId) && (
                    <div className={`${cards.find(c => c.id === selectedCardId)?.color} rounded-[28px] p-6 text-white shadow-lg relative overflow-hidden`}>
                      <div className="relative z-10">
                        <CreditCard className="opacity-80 mb-4" size={24} />
                        <p className="text-[10px] opacity-50 mb-1 uppercase tracking-widest font-bold">{cards.find(c => c.id === selectedCardId)?.name}</p>
                        <p className="text-2xl font-bold mb-6">
                          {formatCurrency((cards.find(c => c.id === selectedCardId)?.limit || 0) - (cards.find(c => c.id === selectedCardId)?.currentSpend || 0))}
                        </p>
                        <div className="space-y-2">
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-white" style={{ width: `${Math.min(100, ((cards.find(c => c.id === selectedCardId)?.currentSpend || 0) / (cards.find(c => c.id === selectedCardId)?.limit || 1)) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

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
                            <TransactionItem key={t.id} t={t} deleteTransaction={deleteTransaction} privacyMode={settings.privacyMode} />
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
                        <div className="h-2.5 bg-black/10 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, stats.progress)}%` }}
                            className="h-full bg-black rounded-full shadow-[0_0_10px_rgba(0,0,0,0.1)]"
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
                                    <span className="text-[10px] font-bold opacity-60 bg-black/20 px-2 py-1 rounded-lg">Vence dia {card.dueDay}</span>
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

                  {billsDueToday.length > 0 && (
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg text-primary flex items-center gap-2">
                          <Calendar size={20} className="relative -top-[1px]" />
                          Pagar hoje
                        </h3>
                      </div>
                      <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                          {billsDueToday.map((t) => (
                            <motion.div 
                              key={t.id}
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9, x: -20 }}
                              className={`${t.isOverdue ? 'bg-rose-500/10 border-rose-500/30' : 'bg-primary/10 border-primary/20'} border rounded-2xl p-4 flex items-center justify-between`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={`w-10 h-10 flex-shrink-0 ${t.isOverdue ? 'bg-rose-500/20 text-rose-500' : 'bg-primary/20 text-primary'} rounded-xl flex items-center justify-center`}>
                                  {CATEGORIES[t.category]?.icon || <MoreHorizontal size={18} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-bold truncate pr-2 ${t.isOverdue ? 'text-rose-500' : 'text-white'}`}>{t.title}</p>
                                  <p className={`text-[10px] ${t.isOverdue ? 'text-rose-500/60' : 'text-primary/60'} font-bold uppercase tracking-widest truncate`}>
                                    {t.category} {t.isOverdue && '• ATRASADO'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-4">
                                <p className={`text-sm font-black ${t.isOverdue ? 'text-rose-500' : 'text-primary'}`}>
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
                      <h3 className="font-bold text-lg">Transações recentes</h3>
                      <button className="text-primary text-sm font-medium" onClick={() => setActiveTab('history')}>Ver tudo</button>
                    </div>
                    <div className="relative">
                      <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                          {filteredTransactions.slice(0, 6).map((t) => (
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
                      {filteredTransactions.length > 6 && (
                        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0F111A] via-[#0F111A]/80 to-transparent pointer-events-none z-10" />
                      )}
                    </div>
                  </section>
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Extrato {selectedMonth.toLocaleDateString('pt-BR', { month: 'long' }).charAt(0).toUpperCase() + selectedMonth.toLocaleDateString('pt-BR', { month: 'long' }).slice(1)}</h2>
                <select 
                  value={selectedHistoryCategory}
                  onChange={(e) => setSelectedHistoryCategory(e.target.value)}
                  className="bg-[#1C1F2B] text-xs font-bold p-2 rounded-xl border border-slate-800 outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Todas">Todas Categorias</option>
                  {Object.keys(CATEGORIES).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-6">
                {extratoTransactions.length === 0 ? (
                  <p className="text-center text-slate-500 py-12">Nenhuma transação encontrada.</p>
                ) : (
                  <>
                    <div className="space-y-3">
                      <AnimatePresence mode="popLayout">
                        {extratoTransactions
                          .filter(t => selectedHistoryCategory === 'Todas' || t.category === selectedHistoryCategory)
                          .map((t) => (
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
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'goals' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 pb-24 max-w-md mx-auto">
              <AIGoalsSummary transactions={transactions} settings={settings} />

              <div className="mb-6">
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
                  const categoryData = Object.entries(categories)
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value);

                  const COLORS = ['#cdfc54', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#10b981'];
                  const total = currentMonthExpenses.reduce((acc, curr) => acc + curr.amount, 0);

                  return (
                    <>
                      <div className="h-[260px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
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

                      <div className="space-y-3 mt-6">
                        {categoryData.map((item, index) => (
                          <div key={item.name} className="flex items-center justify-between p-3 bg-[#1C1F2B]/50 rounded-2xl border border-slate-800/30">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">{item.name}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-white">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</p>
                              <p className="text-[10px] font-bold text-slate-500">{formatCurrency(item.value)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          )}

          {activeTab === 'more' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
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
                          className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl text-sm active:scale-95 transition-transform"
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
                            <Plus size={20} />
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
                        onClick={() => updateSettings({ pushNotifications: !settings.pushNotifications })}
                        className={`w-12 h-6 rounded-full transition-colors relative ${settings.pushNotifications ? 'bg-primary' : 'bg-slate-700'}`}
                      >
                        <motion.div 
                          animate={{ x: settings.pushNotifications ? 26 : 4 }}
                          className={`absolute top-1 w-4 h-4 rounded-full ${settings.pushNotifications ? 'bg-black' : 'bg-white'}`}
                        />
                      </button>
                    </div>
                  </div>
                </SettingsAccordion>

                <SettingsAccordion 
                  title="Segurança" 
                  icon={<Fingerprint size={20} />}
                  isOpen={openedAccordion === 'security'}
                  onToggle={() => setOpenedAccordion(openedAccordion === 'security' ? null : 'security')}
                >
                  <div className="space-y-4 text-left">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                          <Fingerprint size={20} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold">Biometria</p>
                          <p className="text-[10px] text-slate-500">Acessar app com digital/face</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => updateSettings({ biometricsEnabled: !settings.biometricsEnabled })}
                        className={`w-12 h-6 rounded-full transition-colors relative ${settings.biometricsEnabled ? 'bg-primary' : 'bg-slate-700'}`}
                      >
                        <motion.div 
                          animate={{ x: settings.biometricsEnabled ? 26 : 4 }}
                          className={`absolute top-1 w-4 h-4 rounded-full ${settings.biometricsEnabled ? 'bg-black' : 'bg-white'}`}
                        />
                      </button>
                    </div>

                    {deferredPrompt && (
                      <div className="flex items-center justify-between p-4 bg-primary/10 rounded-2xl border border-primary/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
                            <Download size={20} />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-primary">Instalar App</p>
                            <p className="text-[10px] text-primary/60">Tenha o Luko na sua tela inicial</p>
                          </div>
                        </div>
                        <button 
                          onClick={handleInstallClick}
                          className="bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl shadow-lg active:scale-95 transition-transform"
                        >
                          Instalar
                        </button>
                      </div>
                    )}
                  </div>
                </SettingsAccordion>
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
              onClick={() => {
                setActiveTab('dashboard');
                setSelectedCardId(null);
              }} 
              icon={<LayoutDashboard size={20} />} 
              label="Início" 
            />
            <NavButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={20} />} label="Extrato" />
            <div className="absolute left-1/2 -translate-x-1/2 -top-8">
              <button onClick={() => setIsModalOpen(true)} className="w-14 h-14 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/20">
                <Plus size={28} strokeWidth={3} />
              </button>
            </div>
            <div className="w-12" />
            <NavButton 
              active={activeTab === 'goals'} 
              onClick={() => setActiveTab('goals')} 
              icon={<Sparkles size={20} />} 
              label="Oráculo" 
            />
            <NavButton active={activeTab === 'more'} onClick={() => setActiveTab('more')} icon={<SettingsIcon size={20} />} label="Ajustes" />
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
                  const installmentsCount = category === 'Parcela' ? parseInt(formData.get('installmentsCount') as string) || 1 : undefined;
                  const cardId = formData.get('cardId') as string || undefined;
                  const dueDay = cardId ? undefined : ((category === 'Parcela' || category === 'Mensalidade' || category === 'Assinatura') ? parseInt(formData.get('dueDay') as string) || undefined : undefined);
                  
                  await addTransaction({
                    title: formData.get('title') as string,
                    amount: parseCurrencyInput(formData.get('amount') as string),
                    type: 'expense',
                    category: category,
                    cardId: cardId,
                    installmentsCount: installmentsCount,
                    dueDay: dueDay
                  });
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
                    {Object.keys(CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>

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
                  <button type="submit" className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 mt-4">Salvar</button>
                </form>
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
                    dueDay: parseInt(formData.get('dueDay') as string) || undefined,
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
                      <div key={n.id} className="bg-[#0F111A] p-4 rounded-2xl border border-slate-800/50 flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          n.type === 'warning' ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary'
                        }`}>
                          {(n as any).category && CATEGORIES[(n as any).category] ? CATEGORIES[(n as any).category].icon : <Bell size={18} />}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">{n.title}</h4>
                          <p className="text-xs text-slate-400 mt-1">{n.message}</p>
                        </div>
                      </div>
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
            <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setIsMonthPickerOpen(false)} 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ y: -50, opacity: 0 }} 
                animate={{ y: 0, opacity: 1 }} 
                exit={{ y: -50, opacity: 0 }}
                className="bg-[#1C1F2B] w-full max-w-sm rounded-[32px] p-6 relative z-10 shadow-2xl border border-slate-800/50"
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
            <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setSelectedTransaction(null)} 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ y: 100, opacity: 0 }} 
                animate={{ y: 0, opacity: 1 }} 
                exit={{ y: 100, opacity: 0 }}
                className="bg-[#1C1F2B] w-full max-w-sm rounded-t-[40px] sm:rounded-[40px] p-8 relative z-10 shadow-2xl border border-slate-800"
              >
                <div className="w-12 h-1.5 bg-slate-800 rounded-full mx-auto mb-8 sm:hidden" />
                
                <div className="flex flex-col items-center text-center mb-8">
                  <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-4 ${CATEGORIES[selectedTransaction.category]?.color || 'bg-slate-800 text-slate-400'}`}>
                    {getInteractiveIcon(selectedTransaction.title, selectedTransaction.category)}
                  </div>
                  <h3 className="text-2xl font-black mb-1">{selectedTransaction.title}</h3>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">{selectedTransaction.category}</p>
                </div>

                <div className="space-y-6 mb-8">
                  <div className="flex justify-between items-center py-4 border-b border-slate-800/50">
                    <span className="text-slate-400 text-sm font-bold uppercase tracking-widest">Valor</span>
                    <span className={`text-xl font-black ${selectedTransaction.type === 'income' ? 'text-emerald-500' : 'text-white'}`}>
                      {formatCurrency(selectedTransaction.amount)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-4 border-b border-slate-800/50">
                    <span className="text-slate-400 text-sm font-bold uppercase tracking-widest">Data</span>
                    <span className="text-sm font-bold">{selectedTransaction.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                  </div>

                  {selectedTransaction.installmentsCount && selectedTransaction.installmentsCount > 1 && (
                    <>
                      <div className="flex justify-between items-center py-4 border-b border-slate-800/50">
                        <span className="text-slate-400 text-sm font-bold uppercase tracking-widest">Parcela</span>
                        <span className="text-sm font-bold">{selectedTransaction.installmentIndex} de {selectedTransaction.installmentsCount}</span>
                      </div>
                      <div className="flex justify-between items-center py-4 border-b border-slate-800/50">
                        <span className="text-slate-400 text-sm font-bold uppercase tracking-widest">Valor Total</span>
                        <span className="text-sm font-bold">{formatCurrency(selectedTransaction.totalAmount || (selectedTransaction.amount * selectedTransaction.installmentsCount))}</span>
                      </div>
                      <div className="flex justify-between items-center py-4 border-b border-slate-800/50">
                        <span className="text-slate-400 text-sm font-bold uppercase tracking-widest">Restante</span>
                        <span className="text-sm font-bold text-rose-500">
                          {formatCurrency((selectedTransaction.totalAmount || (selectedTransaction.amount * selectedTransaction.installmentsCount)) - (selectedTransaction.amount * (selectedTransaction.installmentIndex || 1)))}
                        </span>
                      </div>
                    </>
                  )}

                  {selectedTransaction.cardId && (
                    <div className="flex justify-between items-center py-4 border-b border-slate-800/50">
                      <span className="text-slate-400 text-sm font-bold uppercase tracking-widest">Cartão</span>
                      <span className="text-sm font-bold">{cards.find(c => c.id === selectedTransaction.cardId)?.name || 'Desconhecido'}</span>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => setSelectedTransaction(null)}
                  className="w-full bg-[#0F111A] text-white font-bold py-4 rounded-2xl border border-slate-800 hover:bg-[#151825] transition-colors"
                >
                  Fechar
                </button>
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
          {showInstallModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setShowInstallModal(false)} 
                className="absolute inset-0 bg-black/80 backdrop-blur-md" 
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-[#1C1F2B] w-full max-w-sm rounded-[32px] p-8 relative z-10 shadow-2xl border border-slate-800/50 text-center"
              >
                <div className="w-20 h-20 bg-primary rounded-[24px] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/20">
                  <Download className="text-on-primary" size={40} />
                </div>
                <h2 className="text-2xl font-bold mb-2">Instalar Luko</h2>
                <p className="text-slate-400 mb-8 text-sm leading-relaxed">
                  Adicione o Luko à sua tela de início para ter acesso rápido e uma experiência completa de aplicativo.
                </p>
                <div className="space-y-3">
                  <button 
                    onClick={() => {
                      handleInstallClick();
                      setShowInstallModal(false);
                    }}
                    className="w-full py-4 bg-primary text-on-primary font-bold rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                  >
                    Instalar Agora
                  </button>
                  <button 
                    onClick={() => setShowInstallModal(false)}
                    className="w-full py-4 bg-white/5 text-slate-400 font-bold rounded-2xl active:scale-95 transition-transform"
                  >
                    Agora não
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      <GlobalErrorUI>
        {renderContent()}
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
