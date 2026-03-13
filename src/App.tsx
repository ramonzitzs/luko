/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
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
  Play
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, Reorder } from 'motion/react';
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
  getDoc
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

// --- Types ---
interface Transaction {
  id: string;
  uid: string;
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
  readNotificationIds?: string[];
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
  
  if (category === 'Assinatura') return <Play size={18} />;

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

const TransactionItem: React.FC<{ t: Transaction, deleteTransaction: (id: string) => Promise<void> | void }> = ({ t, deleteTransaction }) => {
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
        whileDrag={{ scale: 1.02 }}
        className="bg-[#1C1F2B] p-4 rounded-[20px] flex items-center justify-between border border-slate-800/50 relative z-10 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${CATEGORIES[t.category]?.color || 'bg-slate-800 text-slate-400'}`}>
            {getInteractiveIcon(t.title, t.category)}
          </div>
          <div>
            <p className="font-semibold text-sm">{t.title}</p>
            <p className="text-slate-500 text-xs">
              {t.category} 
              {t.parentTransactionId && ` • ${formatCurrency(t.amount * (t.installmentsCount || 1))}`}
            </p>
          </div>
        </div>
        <p className={`font-bold text-sm ${t.type === 'income' ? 'text-emerald-500' : 'text-white'}`}>
          {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
        </p>
      </motion.div>
    </div>
  );
};

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      try {
        const parsed = JSON.parse(event.error.message);
        setErrorMsg(parsed.error || 'Erro desconhecido');
      } catch {
        setErrorMsg(event.error.message);
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white p-8 rounded-[32px] shadow-xl max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <X size={32} />
          </div>
          <h2 className="text-xl font-bold mb-2">Ops! Algo deu errado</h2>
          <p className="text-slate-500 text-sm mb-6">{errorMsg}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const AIGoalsSummary = ({ stats, transactions }: { stats: any, transactions: any[] }) => {
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const generateSummary = async () => {
      if (stats.totalIncome === 0 && stats.expenses === 0) return;
      
      setLoading(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Analise meus dados financeiros e dê um resumo curto e motivador sobre minha meta do mês.
          Renda Total: ${formatCurrency(stats.totalIncome)}
          Gastos Atuais: ${formatCurrency(stats.expenses)}
          Disponível: ${formatCurrency(stats.available)}
          Meta de Gastos: ${formatCurrency(stats.limit)}
          Progresso: ${Math.round(stats.progress)}%
          Últimas transações: ${transactions.slice(0, 5).map(t => `${t.title}: ${formatCurrency(t.amount)}`).join(", ")}
          Responda em Português do Brasil, de forma amigável e direta (máximo 3 frases).`
        });
        setSummary(response.text || "Não foi possível gerar o resumo no momento.");
      } catch (error) {
        console.error("AI Error:", error);
        setSummary("Dica: Mantenha o foco nos seus objetivos financeiros!");
      } finally {
        setLoading(false);
      }
    };

    generateSummary();
  }, [stats.totalIncome, stats.expenses]);

  return (
    <div className="bg-primary/5 p-6 rounded-[24px] border border-primary/20">
      <div className="flex items-center gap-2 mb-3 text-primary">
        <Sparkles size={14} className="animate-pulse" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Insight da IA</span>
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-3 bg-white/5 rounded-full w-full animate-pulse" />
          <div className="h-3 bg-white/5 rounded-full w-3/4 animate-pulse" />
        </div>
      ) : (
        <p className="text-sm text-slate-200 leading-relaxed italic">
          "{summary || "Adicione suas rendas e gastos para receber um insight personalizado."}"
        </p>
      )}
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
  const [settings, setSettings] = useState<UserSettings>({ incomes: [], monthlyLimit: 0, emailNotifications: false, readNotificationIds: [] });
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [selectedHistoryCategory, setSelectedHistoryCategory] = useState<string>('Todas');

  const [newTransCategory, setNewTransCategory] = useState('Variados');
  const [newTransCardId, setNewTransCardId] = useState('');

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

    // Transactions
    const qTransactions = query(
      collection(db, 'transactions'), 
      where('uid', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: (doc.data().date as Timestamp).toDate()
      })) as Transaction[];
      setTransactions(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    // Cards
    const qCards = query(collection(db, 'cards'), where('uid', '==', user.uid));
    const unsubCards = onSnapshot(qCards, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Card[];
      data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setCards(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cards'));

    // Settings
    const unsubSettings = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setSettings({
          incomes: data.incomes || [],
          monthlyLimit: data.monthlyLimit || 0,
          emailNotifications: data.emailNotifications || false,
          readNotificationIds: data.readNotificationIds || []
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    return () => {
      unsubTransactions();
      unsubCards();
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

    const monthly = transactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
    });

    // Consolidate installments and recurring
    const consolidated: Transaction[] = [];
    const seenParents = new Set<string>();
    const seenTitles = new Set<string>();

    monthly.forEach(t => {
      const baseTitle = t.title.split(' (')[0];
      const isInstallment = t.title.includes('(') && t.title.includes('/');
      
      if (t.parentTransactionId) {
        if (!seenParents.has(t.parentTransactionId)) {
          seenParents.add(t.parentTransactionId);
          const match = t.title.match(/\/(\d+)\)/);
          const count = parseInt(match?.[1] || '1') || 1;
          consolidated.push({
            ...t,
            title: baseTitle,
            amount: t.totalAmount || (t.amount * (t.installmentsCount || count))
          });
        }
      } else if (isInstallment) {
        const key = `${baseTitle}-${t.amount}`;
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          const match = t.title.match(/\/(\d+)\)/);
          const count = parseInt(match?.[1] || '1') || 1;
          consolidated.push({
            ...t,
            title: baseTitle,
            amount: t.amount * count
          });
        }
      } else {
        consolidated.push(t);
      }
    });

    return consolidated.filter(t => selectedHistoryCategory === 'Todas' || t.category === selectedHistoryCategory);
  }, [transactions, selectedMonth, selectedHistoryCategory]);

  const billsDueToday = useMemo(() => {
    const today = new Date();
    const todayDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    today.setHours(0, 0, 0, 0);
    
    // Individual bills (not linked to cards)
    const individualBillsRaw = transactions.filter(t => {
      if (t.type !== 'expense' || t.isPaid || t.cardId) return false;
      const tDate = new Date(t.date);
      tDate.setHours(0, 0, 0, 0);
      return tDate.getTime() === today.getTime();
    });

    const individualBills: any[] = [];
    const seenIndividualParents = new Set<string>();

    individualBillsRaw.forEach(t => {
      if (t.parentTransactionId) {
        if (!seenIndividualParents.has(t.parentTransactionId)) {
          seenIndividualParents.add(t.parentTransactionId);
          individualBills.push({
            ...t,
            title: t.title.split(' (')[0],
            amount: t.totalAmount || (t.amount * (t.installmentsCount || parseInt(t.title.match(/\/(\d+)\)/)?.[1] || '1') || 1)),
            isCardBill: false
          });
        }
      } else {
        individualBills.push({ ...t, isCardBill: false });
      }
    });

    // Card bills due today
    const cardBills = cards.filter(card => {
      if (!card.dueDay || card.dueDay !== todayDay) return false;
      
      // Check if there are unpaid transactions for this card this month
      const unpaidTransactions = transactions.filter(t => 
        t.cardId === card.id && 
        t.type === 'expense' && 
        !t.isPaid &&
        new Date(t.date).getMonth() === currentMonth &&
        new Date(t.date).getFullYear() === currentYear
      );
      
      return unpaidTransactions.length > 0;
    }).map(card => {
      const monthly = transactions.filter(t => {
        const tDate = new Date(t.date);
        return t.cardId === card.id && 
               t.type === 'expense' && 
               tDate.getMonth() === currentMonth && 
               tDate.getFullYear() === currentYear;
      });

      // Consolidate installments and recurring
      const consolidated: Transaction[] = [];
      const seenParents = new Set<string>();
      const seenTitles = new Set<string>();

      monthly.forEach(t => {
        const baseTitle = t.title.split(' (')[0];
        const isInstallment = t.title.includes('(') && t.title.includes('/');

        if (t.parentTransactionId) {
          if (!seenParents.has(t.parentTransactionId)) {
            seenParents.add(t.parentTransactionId);
            const match = t.title.match(/\/(\d+)\)/);
            const count = parseInt(match?.[1] || '1') || 1;
            consolidated.push({
              ...t,
              title: baseTitle,
              amount: t.totalAmount || (t.amount * (t.installmentsCount || count))
            });
          }
        } else if (isInstallment) {
          const key = `${baseTitle}-${t.amount}`;
          if (!seenTitles.has(key)) {
            seenTitles.add(key);
            const match = t.title.match(/\/(\d+)\)/);
            const count = parseInt(match?.[1] || '1') || 1;
            consolidated.push({
              ...t,
              title: baseTitle,
              amount: t.amount * count
            });
          }
        } else {
          consolidated.push(t);
        }
      });

      const amount = consolidated.reduce((acc, t) => acc + t.amount, 0);

      return {
        id: `card-bill-${card.id}`,
        cardId: card.id,
        title: `Fatura ${card.name}`,
        amount,
        category: 'Cartão',
        isCardBill: true,
        date: today
      };
    });

    return [...individualBills, ...cardBills];
  }, [transactions, cards]);

  const groupedHistoryTransactions = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    
    extratoTransactions.forEach(t => {
      const date = new Date(t.date);
      const startOfWeek = new Date(date);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      const key = `${startOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${endOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    return Object.entries(groups).sort((a, b) => {
      // Sort by date descending
      const dateA = new Date(a[1][0].date);
      const dateB = new Date(b[1][0].date);
      return dateB.getTime() - dateA.getTime();
    });
  }, [extratoTransactions]);

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

    // Check due dates
    transactions.forEach(t => {
      if (t.type === 'expense' && t.category === 'Mensalidade') {
        const tDate = new Date(t.date);
        tDate.setHours(0, 0, 0, 0);
        
        if (tDate.getTime() === today.getTime()) {
          list.push({
            id: `today-${t.id}`,
            title: 'Vencimento Hoje',
            message: `A mensalidade "${t.title}" vence hoje!`,
            type: 'warning',
            date: new Date(),
            category: t.category
          });
        } else if (tDate.getTime() === tomorrow.getTime()) {
          list.push({
            id: `tomorrow-${t.id}`,
            title: 'Vencimento Amanhã',
            message: `A mensalidade "${t.title}" vence amanhã.`,
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

  if (!isAuthReady) return null;

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
          <h1 className="text-3xl font-bold mb-4 tracking-tight">luko.</h1>
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
    <ErrorBoundary>
      <div className="min-h-screen bg-[#0F111A] text-white font-sans pb-24">
        {/* Header */}
        <header className="p-6 pt-10 max-w-md mx-auto">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img src={user.photoURL || ''} className="w-9 h-9 rounded-full border border-slate-800" alt="Profile" />
              <div>
                <h1 className="text-lg font-bold tracking-tight leading-none">Olá, {user.displayName?.split(' ')[0]}</h1>
                <button 
                  onClick={() => setIsMonthPickerOpen(true)}
                  className="text-[10px] text-slate-500 font-bold tracking-widest flex items-center gap-1 mt-1"
                >
                  <span className="capitalize">
                    {selectedMonth.toLocaleDateString('pt-BR', { month: 'long' })}
                  </span>
                  <span> de {selectedMonth.getFullYear()}</span>
                  <ChevronRight size={10} className="rotate-90" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
                {notifications.length > 0 && (
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
                            <TransactionItem key={t.id} t={t} deleteTransaction={deleteTransaction} />
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
                      <h2 className="text-4xl font-bold mb-6">
                        {formatCurrency(stats.available)}
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
                                      {formatCurrency(transactions
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
                                        {formatCurrency(card.limit - card.currentSpend)}
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
                              className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
                                  {CATEGORIES[t.category]?.icon || <MoreHorizontal size={18} />}
                                </div>
                                <div>
                                  <p className="text-sm font-bold">{t.title}</p>
                                  <p className="text-[10px] text-primary/60 font-bold uppercase tracking-widest">{t.category}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <p className="text-sm font-bold text-primary">{formatCurrency(t.amount)}</p>
                                <button 
                                  onClick={() => markAsPaid(t.id)}
                                  className="bg-primary text-on-primary text-[10px] font-bold px-4 py-2 rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                                >
                                  Pago
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
                    <div className="space-y-3">
                      <AnimatePresence mode="popLayout">
                        {filteredTransactions.slice(0, 5).map((t) => (
                          <TransactionItem key={t.id} t={t} deleteTransaction={deleteTransaction} />
                        ))}
                      </AnimatePresence>
                    </div>
                  </section>
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Extrato Mensal</h2>
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
              
              <div className="space-y-8">
                {groupedHistoryTransactions.length === 0 ? (
                  <p className="text-center text-slate-500 py-12">Nenhuma transação encontrada.</p>
                ) : (
                  groupedHistoryTransactions.map(([week, items]) => (
                    <div key={week} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-[1px] flex-1 bg-slate-800/50" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{week}</span>
                        <div className="h-[1px] flex-1 bg-slate-800/50" />
                      </div>
                      <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                          {items.map((t) => (
                            <TransactionItem key={t.id} t={t} deleteTransaction={deleteTransaction} />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'goals' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h2 className="text-xl font-bold mb-4">Metas Financeiras</h2>
              
              <AIGoalsSummary stats={stats} transactions={transactions} />

              <div className="bg-[#1C1F2B] p-6 rounded-[24px] border border-slate-800/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <Target size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold">Meta de Economia</h3>
                    <p className="text-xs text-slate-500">Quanto você quer guardar este mês</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Economizado</p>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(stats.totalIncome - stats.expenses)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Meta</p>
                      <p className="text-xl font-bold">{formatCurrency(stats.totalIncome * 0.2)}</p>
                    </div>
                  </div>
                  
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, ((stats.totalIncome - stats.expenses) / (stats.totalIncome * 0.2 || 1)) * 100)}%` }}
                      className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(205,252,84,0.3)]"
                    />
                  </div>
                  
                  <p className="text-xs text-slate-400 text-center">
                    Você já economizou {Math.round(((stats.totalIncome - stats.expenses) / (stats.totalIncome * 0.2 || 1)) * 100)}% da sua meta ideal (20% da renda).
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'more' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h2 className="text-xl font-bold mb-4">Configurações</h2>

              <div className="bg-[#1C1F2B] rounded-[24px] overflow-hidden border border-slate-800/50">
                <div className="p-6 border-b border-slate-800/50">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Notificações</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Notificações por E-mail</p>
                      <p className="text-xs text-slate-500">Receba avisos de vencimento 1 dia antes</p>
                    </div>
                    <button 
                      onClick={() => updateSettings({ emailNotifications: !settings.emailNotifications })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${settings.emailNotifications ? 'bg-primary' : 'bg-slate-800'}`}
                    >
                      <motion.div 
                        animate={{ x: settings.emailNotifications ? 26 : 4 }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>
                </div>
                
                <div className="p-6 border-b border-slate-800/50">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Meus Cartões</h3>
                    <button onClick={() => setIsCardModalOpen(true)} className="text-primary text-xs font-bold flex items-center gap-1">
                      <Plus size={14} /> Adicionar
                    </button>
                  </div>
                  <Reorder.Group axis="y" values={cards} onReorder={updateCardsOrder} className="space-y-3">
                    {cards.map(card => (
                      <Reorder.Item key={card.id} value={card}>
                        <div className="flex items-center justify-between p-3 bg-[#0F111A] rounded-xl border border-slate-800/50 cursor-grab active:cursor-grabbing">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${card.color}`} />
                            <span className="text-sm font-medium">{card.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500">{formatCurrency(card.limit)}</span>
                            <div className="flex gap-1">
                              <button onClick={() => setEditingCard(card)} className="p-1 text-slate-500 hover:text-white"><Edit2 size={14} /></button>
                              <button onClick={() => deleteCard(card.id)} className="p-1 text-slate-500 hover:text-rose-500"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        </div>
                      </Reorder.Item>
                    ))}
                    {cards.length === 0 && <p className="text-xs text-slate-500 italic">Nenhum cartão cadastrado.</p>}
                  </Reorder.Group>
                </div>

                {editingCard && (
                  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setEditingCard(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} className="bg-[#1C1F2B] w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-8 relative z-10 shadow-2xl border border-slate-800/50">
                      <h2 className="text-xl font-bold mb-6">Editar Cartão</h2>
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        updateCard(editingCard.id, {
                          name: formData.get('name') as string,
                          limit: parseCurrencyInput(formData.get('limit') as string),
                          color: formData.get('color') as string,
                          dueDay: parseInt(formData.get('dueDay') as string) || undefined,
                        });
                      }} className="space-y-4">
                        <input name="name" defaultValue={editingCard.name} required className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary" />
                        <div className="grid grid-cols-2 gap-4">
                          <MoneyInput name="limit" value={editingCard.limit} className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary" />
                          <select name="dueDay" defaultValue={editingCard.dueDay || ""} className="w-full bg-[#0F111A] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-primary">
                            <option value="">Dia Venc.</option>
                            {[...Array(31)].map((_, i) => (
                              <option key={i+1} value={i+1}>{i+1}</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {CARD_COLORS.map(color => (
                            <label key={color.value} className="relative cursor-pointer">
                              <input type="radio" name="color" value={color.value} className="peer sr-only" defaultChecked={editingCard.color === color.value} />
                              <div className={`h-12 rounded-xl ${color.value} border-4 border-transparent peer-checked:border-white shadow-sm`} />
                            </label>
                          ))}
                        </div>
                        <button type="submit" className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 mt-4">Salvar Alterações</button>
                      </form>
                    </motion.div>
                  </div>
                )}

                <div className="p-6 border-b border-slate-800/50">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Minhas Rendas</h3>
                    <button onClick={addIncomeSource} className="text-primary text-xs font-bold flex items-center gap-1">
                      <Plus size={14} /> Adicionar
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {settings.incomes.map((income) => (
                      <div key={income.id} className="flex gap-3 items-end">
                        <div className="flex-1">
                          <label className="text-[10px] text-slate-500 mb-1 block uppercase font-bold">Rótulo</label>
                          <input 
                            type="text" 
                            value={income.label}
                            onChange={(e) => updateIncomeSource(income.id, e.target.value, income.value)}
                            className="w-full bg-[#0F111A] rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary" 
                          />
                        </div>
                        <div className="w-32">
                          <label className="text-[10px] text-slate-500 mb-1 block uppercase font-bold">Valor</label>
                          <MoneyInput 
                            value={income.value}
                            onChange={(val) => updateIncomeSource(income.id, income.label, val)}
                            className="w-full bg-[#0F111A] rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary" 
                          />
                        </div>
                        <button onClick={() => removeIncomeSource(income.id)} className="p-3 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors">
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                    
                    {settings.incomes.length === 0 && (
                      <p className="text-xs text-slate-500 italic">Nenhuma renda cadastrada.</p>
                    )}
                  </div>
                </div>

                <div className="p-6 border-b border-slate-800/50">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Meta de Gastos</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-primary">
                        {formatCurrency(settings.monthlyLimit || stats.totalIncome)}
                      </span>
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

                    <p className="text-[10px] text-slate-500">
                      Ajuste o quanto você pretende gastar em relação ao seu ganho total de {formatCurrency(stats.totalIncome)}.
                    </p>
                  </div>
                </div>

                <div className="p-2">
                  <button onClick={handleLogout} className="w-full flex items-center justify-between p-4 text-rose-500 hover:bg-rose-500/5 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <LogOut size={20} />
                      <span className="font-semibold">Sair da conta</span>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[#0F111A]/80 backdrop-blur-md border-t border-slate-800/50 px-6 py-3 pb-8 z-40">
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
            <NavButton active={activeTab === 'goals'} onClick={() => setActiveTab('goals')} icon={<Target size={20} />} label="Metas" />
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

          {isMonthPickerOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMonthPickerOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#1C1F2B] w-full max-w-xs rounded-[32px] p-6 relative z-10 shadow-2xl border border-slate-800/50"
              >
                <h2 className="text-lg font-bold mb-4 text-center">Selecionar Mês</h2>
                <div className="grid grid-cols-3 gap-2">
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
                        className={`p-3 rounded-xl text-xs font-bold transition-colors ${
                          isSelected ? 'bg-primary text-on-primary' : 'bg-[#0F111A] text-slate-400 hover:text-white'
                        }`}
                      >
                        {date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-800">
                  <button 
                    onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear() - 1, selectedMonth.getMonth()))}
                    className="p-2 text-slate-400 hover:text-white"
                  >
                    {selectedMonth.getFullYear() - 1}
                  </button>
                  <span className="font-bold">{selectedMonth.getFullYear()}</span>
                  <button 
                    onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear() + 1, selectedMonth.getMonth()))}
                    className="p-2 text-slate-400 hover:text-white"
                  >
                    {selectedMonth.getFullYear() + 1}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
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
