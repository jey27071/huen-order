import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './supabase';

// ─── 타입 정의 ────────────────────────────────────────────────
interface FlyingDot { id: string; startX: number; startY: number; endX: number; endY: number; }
type Tab = 'home' | 'menu' | 'cart' | 'history';
type DrawerView = null | 'coupon' | 'notice' | 'inquiry' | 'settings' | 'profile';
type FullScreenView = null | 'coupon' | 'notice' | 'inquiry' | 'settings' | 'profile';

interface MenuItem { id: string; name: string; price: number; tag: string; image_url: string; description: string; category: string; is_available: boolean; }
interface CartItem extends MenuItem { quantity: number; }
interface Order {
  id: string; date: string; createdAt?: string; total: number;
  status: '준비중' | '제조중' | '준비 완료' | '수령 완료' | '주문 취소';
  orderNo: string; itemsName: string;
  items: { name: string; quantity: number; price: number }[];
}
interface Banner { id: string; image_url: string; title: string; subtitle: string; }
interface Notice { id: string; title: string; content: string; is_pinned: boolean; created_at: string; }
interface Coupon { id: string; type: string; is_used: boolean; created_at: string; }
interface Inquiry { id: string; title: string; content: string; is_answered: boolean; answer?: string; created_at: string; }

// ─── 메인 앱 ──────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [items, setItems] = useState<CartItem[]>([]);
  const [flyingDots, setFlyingDots] = useState<FlyingDot[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<DrawerView>(null);
  const [fullScreenView, setFullScreenView] = useState<FullScreenView>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dismissedOrderIds, setDismissedOrderIds] = useState<string[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [stamps, setStamps] = useState(0);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [orderPaused, setOrderPaused] = useState(false);
  const [orderPausedMessage, setOrderPausedMessage] = useState('');
  const [userName, setUserName] = useState('회원');
  const [userId, setUserId] = useState<string>('');
  const [hasNewNotice, setHasNewNotice] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const cartRef = useRef<HTMLButtonElement>(null);

  const currentDisplayedOrder = orders.find(o => !dismissedOrderIds.includes(o.id) && o.status !== '수령 완료');
  const cartItemCount = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // ─── 데이터 로드 ─────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id || '';
    setUserId(uid);
    if (user) setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || '회원');

    const [ordersRes, menuRes, bannersRes, settingsRes, stampsRes, couponsRes, noticesRes] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('menu_items').select('*').order('sort_order'),
      supabase.from('banners').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('app_settings').select('*').eq('id', 'global').single(),
      uid ? supabase.from('stamps').select('*').eq('user_id', uid).single() : Promise.resolve({ data: null }),
      uid ? supabase.from('coupons').select('*').eq('user_id', uid).eq('is_used', false) : Promise.resolve({ data: [] }),
      supabase.from('notices').select('id, created_at').order('created_at', { ascending: false }).limit(1),
    ]);

    if (ordersRes.data) {
      setOrders(ordersRes.data.map((r: any) => ({
        id: r.id, date: new Date(r.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        total: r.total, status: r.status, orderNo: r.order_no, itemsName: r.items_name, items: r.items,
      })));
    }
    if (menuRes.data) setMenuItems(menuRes.data);
    if (bannersRes.data) setBanners(bannersRes.data);
    if (settingsRes.data) { setOrderPaused(settingsRes.data.order_paused); setOrderPausedMessage(settingsRes.data.order_paused_message); }
    if (stampsRes.data) setStamps(stampsRes.data.count);
    if (couponsRes.data) setCoupons(couponsRes.data as Coupon[]);

    // 신규 공지 확인 (최근 3일 이내)
    if (noticesRes.data && noticesRes.data.length > 0) {
      const latest = new Date((noticesRes.data[0] as any).created_at);
      const diff = (Date.now() - latest.getTime()) / (1000 * 60 * 60 * 24);
      setHasNewNotice(diff < 3);
    }
  }, []);

  // ─── 주기적 폴링 (웹뷰 WebSocket 백업용) ───────────────────
  useEffect(() => {
    // 5초마다 주문 상태 갱신 (웹뷰에서 WebSocket이 끊겨도 동작)
    const interval = setInterval(() => {
      fetchAll();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ─── 로그인 상태 감지 ────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
      setAuthReady(true);
      // ✅ 세션 있으면 바로 데이터 로드
      if (session) fetchAll();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
      if (session) fetchAll();
    });
    return () => subscription.unsubscribe();
  }, []);

  // ✅ 네이티브 앱에서 호출할 수 있도록 fetchAll을 window에 노출
  useEffect(() => {
    (window as any).__huenFetchAll = fetchAll;
    return () => { delete (window as any).__huenFetchAll; };
  }, [fetchAll]);

  useEffect(() => {
    // ✅ 로그인 여부 관계없이 항상 실시간 구독 시작
    const channel = supabase.channel('app-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'banners' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stamps' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, () => fetchAll())
      .subscribe((status) => {
        console.log('실시간 구독 상태:', status);
      });
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── 장바구니 ─────────────────────────────────────────────────
  const addToCart = (menuItem: MenuItem) => {
    setItems(prev => {
      const ex = prev.find(i => i.id === menuItem.id);
      return ex ? prev.map(i => i.id === menuItem.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev, { ...menuItem, quantity: 1 }];
    });
  };
  const updateQuantity = (id: string, delta: number) => setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const handleAddToCart = (e: React.MouseEvent, item: MenuItem) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cartRect = cartRef.current?.getBoundingClientRect();
    if (cartRect) {
      const dot: FlyingDot = { id: Math.random().toString(), startX: rect.left + rect.width / 2, startY: rect.top + rect.height / 2, endX: cartRect.left + cartRect.width / 2, endY: cartRect.top + cartRect.height / 2 };
      setFlyingDots(prev => [...prev, dot]);
      setTimeout(() => setFlyingDots(prev => prev.filter(d => d.id !== dot.id)), 700);
    }
    addToCart(item);
    showToast(`${item.name} 담겼어요!`);
  };

  // ─── 스탬프 적립 ──────────────────────────────────────────────
  const addStamp = async (uid: string, addCount: number = 1) => {
    const { data: st } = await supabase.from('stamps').select('*').eq('user_id', uid).single();
    const currentCount = st?.count || 0;
    const newCount = currentCount + addCount;

    if (newCount >= 10) {
      // 10개 이상이면 쿠폰 발급하고 나머지는 다음 스탬프로
      const couponCount = Math.floor(newCount / 10);
      const remainder = newCount % 10;
      for (let i = 0; i < couponCount; i++) {
        await supabase.from('coupons').insert({ user_id: uid, type: 'americano' });
      }
      await supabase.from('stamps').upsert({ user_id: uid, count: remainder, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      showToast(`🎉 스탬프 ${newCount}개 달성! 아메리카노 쿠폰 ${couponCount}장 발급됐어요!`);
    } else {
      await supabase.from('stamps').upsert({ user_id: uid, count: newCount, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      showToast(`☕ 스탬프 ${newCount}/10 적립됐어요!`);
    }
  };

  // ─── 결제 ─────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (orderPaused) { showToast('현재 주문이 중단되어 있습니다.'); return; }
    setIsCheckingOut(true);
    const orderNo = Math.floor(1000 + Math.random() * 9000).toString();
    const itemsName = items.length > 1 ? `${items[0].name} 외 ${items.length - 1}` : items[0]?.name || '';
    const checkoutTotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

    const { error } = await supabase.from('orders').insert({
      order_no: orderNo, total: checkoutTotal, status: '준비중',
      items_name: itemsName, items: items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
    });
    if (error) { alert('주문 중 오류가 발생했습니다.'); setIsCheckingOut(false); return; }

    // ✅ 쿠폰 사용 처리
    if (appliedCoupon) {
      await supabase.from('coupons').update({ is_used: true, used_at: new Date().toISOString() }).eq('id', appliedCoupon.id);
      setAppliedCoupon(null);
    }

    // ✅ 음료 카테고리 있으면 스탬프 적립 (coffee, tea, decaf)
    // ✅ 쿠폰 사용 주문이 아닐 때만 스탬프 적립
    if (!appliedCoupon) {
      const drinkCategories = ['coffee', 'tea', 'decaf'];
      const drinkCount = items
        .filter(i => drinkCategories.includes(i.category))
        .reduce((sum, i) => sum + i.quantity, 0);
      if (drinkCount > 0) {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser?.id) await addStamp(currentUser.id, drinkCount);
      }
    }

    setItems([]);
    setIsCheckingOut(false);
    setActiveTab('history');
    setIsDrawerOpen(false);
    setDrawerView(null);
    await fetchAll();
  };

  // ─── 쿠폰 사용 ────────────────────────────────────────────────
  const handleUseCoupon = (coupon: Coupon, isIce: boolean) => {
    const americanoMenu = menuItems.find(m => m.name.includes('아메리카노') && !m.name.includes('디카페인'));
    if (!americanoMenu) { showToast('아메리카노 메뉴를 찾을 수 없어요.'); return; }
    const couponItem = { ...americanoMenu, name: isIce ? '아메리카노 (아이스)' : '아메리카노 (따뜻한)', price: 0, quantity: 1 };
    setItems([couponItem]);
    setAppliedCoupon(coupon);
    setFullScreenView(null);
    setIsDrawerOpen(false);
    setDrawerView(null);
    setActiveTab('cart');
    showToast('쿠폰이 적용됐어요! 결제해주세요 😊');
  };

  // 로그인 안 된 경우 로그인 화면 표시
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#1a2e1b] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-[#c8e6c9]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-[#c8e6c9] text-sm font-medium">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <WebLoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="relative min-h-screen bg-surface font-['Be_Vietnam_Pro',sans-serif] overflow-hidden max-w-lg mx-auto">

      {/* 주문 중단 배너 */}
      <AnimatePresence>
        {orderPaused && (
          <motion.div initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }}
            className="fixed top-0 left-0 right-0 max-w-lg mx-auto z-[200] bg-error text-white px-4 py-3 text-center text-sm font-bold flex items-center justify-center gap-2 shadow-lg">
            <span className="material-symbols-outlined text-[18px]">warning</span>
            {orderPausedMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 헤더 */}
      <header className={`fixed top-0 left-0 right-0 max-w-lg mx-auto z-50 bg-white/90 backdrop-blur-xl border-b border-secondary/10 ${orderPaused ? 'mt-12' : ''}`}>
        <div className="flex items-center justify-between px-5 py-3">
          <button onClick={() => { setIsDrawerOpen(true); setDrawerView(null); }} className="p-1.5 rounded-lg hover:bg-surface-container transition-colors relative">
            <span className="material-symbols-outlined text-secondary">menu</span>
            {hasNewNotice && <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>}
          </button>
          <div className="h-8">
            <img src="/logo.png" alt="HUEN" className="h-full object-contain mix-blend-multiply"
              onError={e => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden'); }} />
            <h1 className="hidden text-xl font-bold text-primary italic tracking-tight">HUEN</h1>
          </div>
          <div className="w-8" />
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className={`px-5 pb-32 ${orderPaused ? 'pt-28' : 'pt-20'}`}>
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <HomeView currentOrder={currentDisplayedOrder} onDismissOrder={id => setDismissedOrderIds(p => [...p, id])}
                banners={banners} stamps={stamps} coupons={coupons} />
            </motion.div>
          )}
          {activeTab === 'menu' && (
            <motion.div key="menu" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <MenuView onAddToCart={handleAddToCart} menuItems={menuItems} orderPaused={orderPaused} />
            </motion.div>
          )}
          {activeTab === 'cart' && (
            <motion.div key="cart" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <CartView items={items} updateQuantity={updateQuantity} removeItem={removeItem}
                total={total} isCheckingOut={isCheckingOut} orderPaused={orderPaused}
                appliedCoupon={appliedCoupon}
                onRemoveCoupon={() => {
                  setAppliedCoupon(null);
                  setItems([]);
                }}
                onCheckout={() => handleCheckout()} />
            </motion.div>
          )}
          {activeTab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <HistoryView orders={orders} isCancelling={isCancelling}
                onCancelOrder={async id => {
                  setIsCancelling(id);
                  await supabase.from('orders').update({ status: '주문 취소' }).eq('id', id);
                  await fetchAll();
                  setIsCancelling(null);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 하단 네비 */}
      <nav className="fixed bottom-0 left-0 w-full max-w-lg mx-auto z-50 bg-white/90 backdrop-blur-xl rounded-t-[16px] shadow-[0_-4px_20px_rgba(44,62,45,0.05)] border-t border-secondary/10 px-4 pb-6 pt-3">
        <div className="flex justify-around items-center">
          {[
            { tab: 'home', icon: 'home', label: '홈' },
            { tab: 'menu', icon: 'local_cafe', label: '메뉴' },
            { tab: 'cart', icon: 'shopping_bag', label: '장바구니', badge: cartItemCount, ref: cartRef },
            { tab: 'history', icon: 'receipt_long', label: '주문내역' },
          ].map(({ tab, icon, label, badge, ref }: any) => (
            <button key={tab} ref={ref} onClick={() => setActiveTab(tab as Tab)}
              className={`relative flex flex-col items-center justify-center transition-all duration-300 active:scale-95 min-w-[76px] px-3 py-2 z-0 ${activeTab === tab ? 'text-white -translate-y-1' : 'text-on-surface-variant hover:text-primary'}`}>
              {activeTab === tab && (
                <motion.div layoutId="nav-pill" className="absolute inset-0 bg-primary-container shadow-md -z-10" style={{ borderRadius: 8 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              )}
              <div className="relative z-10">
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
                {badge > 0 && (
                  <motion.div key={badge} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="absolute -top-1.5 -right-2.5 bg-error text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-[1.5px] border-white/90">
                    {badge}
                  </motion.div>
                )}
              </div>
              <span className="relative z-10 text-[11px] font-semibold mt-1 whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm border border-secondary/20 text-primary px-5 py-2.5 rounded-[7px] text-[13px] font-bold shadow-[0_10px_30px_rgba(44,62,45,0.15)] z-[9999] flex items-center gap-2 whitespace-nowrap">
            <span className="material-symbols-outlined text-[18px] text-primary-container">check_circle</span>
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flying Dots */}
      {flyingDots.map(dot => (
        <motion.div key={dot.id}
          initial={{ x: dot.startX, y: dot.startY, scale: 1, opacity: 1 }}
          animate={{ x: dot.endX, y: dot.endY, scale: 0.3, opacity: 0 }}
          transition={{ x: { duration: 0.6, ease: 'linear' }, y: { duration: 0.6, ease: 'easeIn' }, opacity: { duration: 0.6 } }}
          className="fixed z-[9999] w-5 h-5 bg-primary-container rounded-full pointer-events-none shadow-lg" />
      ))}

      {/* 사이드 드로어 */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setIsDrawerOpen(false); setDrawerView(null); }}
              className="fixed inset-0 bg-black/40 z-[100] backdrop-blur-sm" />
            <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-80 bg-white z-[101] shadow-2xl flex flex-col">

              <div className="p-6 border-b border-secondary/10 flex items-center justify-between">
                <div className="h-8">
                  <img src="/logo.png" alt="HUEN" className="h-full object-contain mix-blend-multiply"
                    onError={e => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden'); }} />
                  <h2 className="hidden text-xl font-bold text-primary italic">HUEN</h2>
                </div>
                <button onClick={() => { setIsDrawerOpen(false); setDrawerView(null); }} className="material-symbols-outlined text-secondary hover:text-primary transition-colors">close</button>
              </div>

              <div className="flex-grow overflow-y-auto">
                {drawerView === null && (
                  <>
                    <div className="p-5 bg-surface-container-low border-b border-secondary/10 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary-container/20 border border-secondary/20 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary-container">person</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-primary text-[15px]">{userName}</h3>
                        <p className="text-[12px] text-outline font-semibold mt-0.5">스탬프 {stamps}/10</p>
                      </div>
                    </div>
                    <div className="py-4">
                      <div className="px-4 text-xs font-bold text-outline uppercase tracking-wider mb-2">계정 관리</div>
                      {[
                        { icon: 'person', label: '내 정보 관리', view: 'profile' as FullScreenView },
                        { icon: 'confirmation_number', label: '쿠폰함', view: 'coupon' as FullScreenView, badge: coupons.length },
                      ].map((m, i) => (
                        <button key={i} onClick={() => { setFullScreenView(m.view); setIsDrawerOpen(false); }}
                          className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-surface-container transition-colors text-left">
                          <span className="material-symbols-outlined text-secondary opacity-80">{m.icon}</span>
                          <span className="font-semibold text-[14px] text-on-surface">{m.label}</span>
                          {m.badge && m.badge > 0 && (
                            <span className="ml-auto bg-error text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{m.badge}</span>
                          )}
                          <span className="material-symbols-outlined text-outline text-[16px] ml-auto">chevron_right</span>
                        </button>
                      ))}
                      <div className="h-px bg-secondary/10 my-4 mx-4" />
                      <div className="px-4 text-xs font-bold text-outline uppercase tracking-wider mb-2">고객 지원</div>
                      {[
                        { icon: 'campaign', label: '공지사항', view: 'notice' as FullScreenView, dot: hasNewNotice },
                        { icon: 'help', label: '고객센터', view: 'inquiry' as FullScreenView },
                        { icon: 'settings', label: '설정', view: 'settings' as FullScreenView },
                      ].map((m, i) => (
                        <button key={i} onClick={() => { setFullScreenView(m.view); setIsDrawerOpen(false); }}
                          className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-surface-container transition-colors text-left">
                          <span className="material-symbols-outlined text-secondary opacity-80">{m.icon}</span>
                          <span className="font-semibold text-[14px] text-on-surface">{m.label}</span>
                          {m.dot && <span className="w-2 h-2 bg-error rounded-full ml-1"></span>}
                          <span className="material-symbols-outlined text-outline text-[16px] ml-auto">chevron_right</span>
                        </button>
                      ))}
                      <div className="h-px bg-secondary/10 my-4 mx-4" />
                      <button onClick={async () => {
                        await supabase.auth.signOut();
                        // ✅ 네이티브 앱에 로그아웃 메시지 전송 (하이브리드 앱용)
                        if ((window as any).ReactNativeWebView) {
                          (window as any).ReactNativeWebView.postMessage('LOGOUT');
                        } else {
                          window.location.reload();
                        }
                      }}
                        className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-surface-container text-error transition-colors text-left">
                        <span className="material-symbols-outlined text-error opacity-80">logout</span>
                        <span className="font-semibold text-[14px]">로그아웃</span>
                      </button>
                    </div>
                  </>
                )}

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 전체화면 슬라이드 뷰 */}
      <AnimatePresence>
        {fullScreenView && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setFullScreenView(null)}
              className="fixed inset-0 bg-black/20 z-[150]" />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed inset-0 bg-surface z-[151] overflow-y-auto max-w-lg mx-auto">
              {fullScreenView === 'profile' && <ProfileView onBack={() => setFullScreenView(null)} userId={userId} userName={userName} onNameUpdate={setUserName} />}
              {fullScreenView === 'coupon' && <CouponView coupons={coupons} onBack={() => setFullScreenView(null)} onUseCoupon={handleUseCoupon} />}
              {fullScreenView === 'notice' && <NoticeView onBack={() => setFullScreenView(null)} />}
              {fullScreenView === 'inquiry' && <InquiryView onBack={() => setFullScreenView(null)} />}
              {fullScreenView === 'settings' && <SettingsView onBack={() => setFullScreenView(null)} />}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── 홈 뷰 ───────────────────────────────────────────────────
function HomeView({ currentOrder, onDismissOrder, banners, stamps, coupons }: any) {
  const [bannerIdx, setBannerIdx] = useState(0);
  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setBannerIdx(i => (i + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, [banners.length]);

  return (
    <div className="pt-4 space-y-12">
      <section>
        <div className="relative w-full h-64 rounded-[12px] overflow-hidden shadow-[0_8px_30px_rgb(44,62,45,0.08)]">
          <AnimatePresence mode="wait">
            {banners.length > 0 ? (
              <motion.div key={bannerIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="absolute inset-0">
                <img className="w-full h-full object-cover" alt="배너" src={banners[bannerIdx]?.image_url} />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent flex flex-col justify-end p-8">
                  <span className="text-white/90 font-semibold tracking-[0.2em] mb-2 text-xs uppercase">{banners[bannerIdx]?.subtitle}</span>
                  <h2 className="text-white text-3xl font-bold italic mb-2 tracking-tight">{banners[bannerIdx]?.title}</h2>
                </div>
              </motion.div>
            ) : (
              <div className="w-full h-full bg-surface-container flex items-center justify-center">
                <span className="text-outline text-sm">배너 준비 중</span>
              </div>
            )}
          </AnimatePresence>
          {banners.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
              {banners.map((_: any, i: number) => (
                <button key={i} onClick={() => setBannerIdx(i)}
                  className={`h-1.5 rounded-full transition-all ${i === bannerIdx ? 'bg-white w-4' : 'bg-white/50 w-1.5'}`} />
              ))}
            </div>
          )}
        </div>
      </section>

      {currentOrder && (
        <section>
          <div className="bg-white p-6 rounded-[12px] shadow-[0_4px_24px_rgba(44,62,45,0.03)] border border-secondary/10 hover:border-primary/20 transition-colors relative">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-lg font-bold text-primary">현재 주문 현황</h3>
              {(currentOrder.status === '주문 취소' || currentOrder.status === '준비 완료') && (
                <button onClick={() => onDismissOrder(currentOrder.id)} className="material-symbols-outlined text-secondary hover:text-primary transition-colors bg-surface-container rounded-full p-1 w-8 h-8 flex items-center justify-center shadow-sm">close</button>
              )}
            </div>
            {currentOrder.status === '주문 취소' ? (
              <div className="flex flex-col items-center py-6 bg-error/5 rounded-md border border-error/10 text-center">
                <span className="material-symbols-outlined text-error text-4xl mb-3">cancel</span>
                <span className="text-lg font-bold text-error mb-1">주문 취소됨</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center relative py-2">
                  <div className="absolute left-0 top-1/2 w-full h-1 bg-secondary-container -z-0 -translate-y-1/2 rounded-full">
                    <div className={`h-full bg-primary rounded-full transition-all duration-500 ${currentOrder.status === '준비 완료' ? 'w-full' : currentOrder.status === '제조중' ? 'w-1/2' : 'w-1/4'}`}></div>
                  </div>
                  {[
                    { icon: 'check', label: '주문 확인', active: true },
                    { icon: 'local_cafe', label: '음료 준비중', active: currentOrder.status === '제조중' || currentOrder.status === '준비 완료' },
                    { icon: 'shopping_bag', label: '픽업 대기', active: currentOrder.status === '준비 완료' },
                  ].map((step, i) => (
                    <div key={i} className="flex flex-col items-center gap-2 z-10 w-12 bg-white">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ring-4 ring-white shadow-sm ${step.active ? 'bg-primary text-white' : 'bg-surface-container border border-secondary-container text-secondary'}`}>
                        <span className="material-symbols-outlined text-[16px]">{step.icon}</span>
                      </div>
                      <span className="text-[11px] font-bold text-primary whitespace-nowrap">{step.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex justify-center items-center bg-surface-container-low p-4 rounded-md border border-secondary/5 text-center">
                  {currentOrder.status === '준비 완료' ? (
                    <div><span className="text-[11px] text-primary font-semibold block mb-1 uppercase tracking-widest">수령 안내</span>
                      <span className="text-primary-container text-2xl font-bold">음료가 준비되었습니다</span></div>
                  ) : (
                    <div><span className="text-[11px] text-outline font-semibold block mb-1">예상 픽업 시간</span>
                      <span className="text-primary text-2xl font-bold">10-15분</span></div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="bg-white p-8 rounded-[12px] shadow-[0_4px_24px_rgba(44,62,45,0.03)] border border-secondary/10 relative overflow-hidden">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="text-xl font-bold text-primary mb-2">나의 리워드</h3>
              <p className="text-on-surface-variant text-sm">스탬프 10개를 모으면 무료 커피 1잔</p>
            </div>
            <div className="bg-secondary-container/30 px-3 py-1 rounded-full flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-secondary">stars</span>
              <span className="text-sm font-semibold text-secondary">{stamps}/10</span>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={`aspect-square rounded-md flex items-center justify-center border ${i < stamps ? 'bg-secondary-container/40 border-secondary-container' : 'bg-surface-container border-dashed border-secondary/20'}`}>
                <span className={`material-symbols-outlined ${i < stamps ? 'text-secondary' : 'text-secondary/20'}`}>eco</span>
              </div>
            ))}
          </div>
          {coupons.length > 0 && (
            <div className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/10 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-2xl">confirmation_number</span>
              <div>
                <p className="font-bold text-primary text-sm">사용 가능한 쿠폰 {coupons.length}장</p>
                <p className="text-xs text-outline mt-0.5">쿠폰함에서 사용하세요</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── 메뉴 뷰 ─────────────────────────────────────────────────
function MenuView({ onAddToCart, menuItems, orderPaused }: any) {
  const [activeCategory, setActiveCategory] = useState('all');
  const categories = [
    { id: 'all', label: '전체' }, { id: 'coffee', label: '커피' },
    { id: 'tea', label: '차' }, { id: 'decaf', label: '디카페인' }, { id: 'food', label: '푸드' }
  ];
  const filtered = activeCategory === 'all' ? menuItems : menuItems.filter((i: MenuItem) => i.category === activeCategory);

  return (
    <div className="pt-8 w-full">
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
            className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 ${activeCategory === cat.id ? 'bg-primary-container text-white shadow-md' : 'bg-white text-secondary border border-secondary/20 hover:bg-surface-container'}`}>
            {cat.label}
          </button>
        ))}
      </div>
      <div className="mb-6">
        <h2 className="text-[28px] leading-tight tracking-tight font-bold text-primary">
          {activeCategory === 'all' ? '이번 시즌 메뉴' : categories.find(c => c.id === activeCategory)?.label}
        </h2>
        <p className="text-on-surface-variant text-base mt-2">정성껏 준비한 맛의 탐험을 시작하세요</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
        {filtered.map((item: MenuItem) => (
          <div key={item.id} className={`bg-white rounded-[12px] p-4 flex gap-5 shadow-[0_10px_40px_-10px_rgba(44,62,45,0.08)] transition-transform duration-300 ${item.is_available ? 'hover:-translate-y-1' : 'opacity-70'}`}>
            <div className="w-28 h-28 rounded-lg overflow-hidden shrink-0 relative">
              <img alt={item.name} src={item.image_url} className="w-full h-full object-cover" />
              {!item.is_available && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold bg-error px-2 py-1 rounded-md">일시 품절</span>
                </div>
              )}
            </div>
            <div className="flex flex-col justify-between flex-grow py-1">
              <div>
                <h3 className="text-[17px] font-bold text-primary tracking-tight">{item.name}</h3>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-primary/10 text-[10px] font-bold text-primary tracking-wide mt-1 mb-2">{item.tag}</span>
                <p className="text-[13px] text-outline leading-snug line-clamp-2">{item.description}</p>
              </div>
              <div className="flex justify-between items-end mt-4">
                <div className="font-bold text-primary-container text-base">₩{item.price.toLocaleString()}</div>
                {item.is_available ? (
                  <button onClick={e => !orderPaused && onAddToCart(e, item)} disabled={orderPaused}
                    className="flex items-center gap-1 bg-primary-container disabled:bg-surface-variant disabled:text-outline text-white px-3 py-2 rounded-md active:scale-95 transition-all text-sm font-semibold shadow-sm hover:bg-primary-container/90">
                    <span className="material-symbols-outlined text-[16px]">add_shopping_cart</span>담기
                  </button>
                ) : (
                  <span className="text-xs font-bold text-error bg-error/10 px-3 py-2 rounded-md">일시 품절</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 장바구니 뷰 ──────────────────────────────────────────────
function CartView({ items, updateQuantity, removeItem, total, onCheckout, isCheckingOut, orderPaused, appliedCoupon, onRemoveCoupon }: any) {
  return (
    <div className="pt-8">
      <div className="mb-8">
        <h2 className="text-[32px] leading-tight tracking-tight font-bold text-primary">장바구니</h2>
        <p className="text-on-surface-variant text-base mt-2">나의 선택을 마지막으로 확인해보세요</p>
      </div>
      <div className="space-y-4">
        {items.map((item: CartItem) => (
          <div key={item.id} className="bg-white rounded-[10px] p-5 flex gap-5 shadow-[0_4px_20px_rgba(44,62,45,0.05)] border border-transparent hover:border-secondary/10 transition-shadow">
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-surface-container shrink-0">
              <img alt={item.name} src={item.image_url} className="w-full h-full object-cover" />
            </div>
            <div className="flex-grow flex flex-col justify-between">
              <div className="flex justify-between items-start gap-4">
                <h3 className="text-[16px] font-semibold text-primary">{item.name}</h3>
                <span className="text-[16px] font-semibold text-primary">₩{item.price.toLocaleString()}</span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-3 bg-surface-container-low rounded-md px-2 py-1 select-none border border-secondary/10">
                  <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-secondary transition-colors">
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                  </button>
                  <span className="w-4 text-center font-semibold text-[13px] text-primary">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white text-secondary transition-colors">
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>
                <button onClick={() => removeItem(item.id)} className="p-2 text-error opacity-50 hover:opacity-100 hover:bg-error/10 rounded-md transition-all">
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="bg-white rounded-[12px] p-12 text-center border border-secondary/5">
            <span className="material-symbols-outlined text-5xl text-outline-variant mb-4">shopping_cart</span>
            <p className="text-on-surface-variant font-medium">장바구니가 비어있습니다.</p>
          </div>
        )}
      </div>
      <div className="mt-8 bg-white rounded-[12px] p-8 shadow-[0_4px_24px_rgba(44,62,45,0.04)] border border-secondary/10">
        <h4 className="text-[18px] font-semibold text-primary mb-6">주문 요약</h4>
        <div className="space-y-4">
          {items.map((item: CartItem) => (
            <div key={item.id} className="flex justify-between text-on-surface-variant font-medium text-sm">
              <span>{item.name} <span className="text-outline">x{item.quantity}</span></span>
              <span>₩{(item.price * item.quantity).toLocaleString()}</span>
            </div>
          ))}
          <div className="pt-5 mt-5 border-t border-secondary/20 flex justify-between items-center">
            <span className="text-[20px] font-bold text-primary">합계</span>
            <span className="text-[28px] font-bold text-primary-container">₩{total.toLocaleString()}</span>
          </div>
        </div>
        {/* 쿠폰 적용 표시 */}
        {appliedCoupon && (
          <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">confirmation_number</span>
              <span className="text-sm font-bold text-primary">아메리카노 쿠폰 적용됨</span>
            </div>
            <button onClick={onRemoveCoupon} className="text-xs text-outline hover:text-error transition-colors font-semibold">취소</button>
          </div>
        )}
        {orderPaused && (
          <div className="mt-4 p-3 bg-error/5 border border-error/20 rounded-lg text-center text-sm text-error font-semibold">현재 주문이 일시 중단되어 있습니다</div>
        )}
        <button disabled={items.length === 0 || isCheckingOut || orderPaused} onClick={onCheckout}
          className="w-full mt-8 bg-primary-container disabled:bg-surface-variant disabled:text-outline text-white py-4 flex justify-center items-center gap-2 rounded-[10px] text-[18px] font-bold shadow-lg hover:bg-primary-container/90 active:scale-[0.98] transition-all duration-200">
          {isCheckingOut ? (
            <><svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>주문 중...</span></>
          ) : (
            <><span className="material-symbols-outlined">payments</span><span>결제하기</span></>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── 주문내역 뷰 ──────────────────────────────────────────────
function HistoryView({ orders, onCancelOrder, isCancelling }: any) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  // ✅ 최신순 정렬 (createdAt 기준)
  const sortedOrders = [...orders].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
  return (
    <div className="pt-8 relative">
      <h3 className="text-[20px] font-bold text-primary mb-6">최근 주문 내역</h3>
      <div className="space-y-4 pb-8">
        {sortedOrders.map((order: Order) => (
          <div key={order.id} className="bg-white p-5 rounded-[12px] shadow-[0_4px_20px_rgba(44,62,45,0.03)] border border-secondary/10 hover:border-primary/20 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-xs font-semibold text-outline tracking-wider">{order.date}</span>
                <h4 className="text-lg font-bold text-primary mt-1">{order.itemsName}</h4>
              </div>
              <div className="text-right">
                <span className="block text-sm text-outline mb-1">#{order.orderNo}</span>
                <span className="text-lg font-bold text-primary-container">₩{order.total.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex justify-between items-center mt-4 flex-wrap gap-2">
              <span className={`px-3 py-1 text-xs font-bold rounded-full ${order.status === '준비 완료' ? 'bg-primary/10 text-primary' : order.status === '주문 취소' ? 'bg-error/10 text-error' : order.status === '수령 완료' ? 'bg-surface-variant text-outline' : order.status === '제조중' ? 'bg-amber-100 text-amber-700' : 'bg-secondary-container/50 text-secondary'}`}>
                {order.status}
              </span>
              <div className="flex gap-3">
                {order.status === '준비중' && (
                  <button onClick={() => onCancelOrder(order.id)} disabled={isCancelling === order.id}
                    className="text-sm font-semibold text-error/80 hover:text-error transition-colors flex items-center gap-1 disabled:opacity-50">
                    {isCancelling === order.id ? <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : null}
                    {isCancelling === order.id ? '취소 중...' : '주문 취소'}
                  </button>
                )}

                <button onClick={() => setSelectedOrder(order)} className="text-sm font-semibold text-secondary flex items-center hover:text-primary transition-colors">
                  상세 보기 <span className="material-symbols-outlined text-[16px] ml-0.5">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className="bg-white rounded-[12px] p-12 text-center border border-secondary/5">
            <span className="material-symbols-outlined text-5xl text-outline-variant mb-4">receipt_long</span>
            <p className="text-on-surface-variant font-medium">주문 내역이 없습니다.</p>
          </div>
        )}
      </div>
      <AnimatePresence>
        {selectedOrder && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-end justify-center"
            onClick={() => setSelectedOrder(null)}>
            <motion.div onClick={e => e.stopPropagation()} className="bg-white w-full max-w-lg rounded-t-[20px] p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-primary">주문 상세</h3>
                <button onClick={() => setSelectedOrder(null)} className="material-symbols-outlined text-secondary">close</button>
              </div>
              <div className="space-y-3 mb-6">
                {selectedOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{item.name} x{item.quantity}</span>
                    <span className="font-semibold">₩{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-secondary/10 flex justify-between">
                <span className="font-bold text-primary">합계</span>
                <span className="font-bold text-primary-container text-lg">₩{selectedOrder.total.toLocaleString()}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── 내 정보 관리 ─────────────────────────────────────────────
function ProfileView({ onBack, userId, userName, onNameUpdate }: any) {
  const [name, setName] = useState(userName);
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setEmail(user.email || '');
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) { setName(data.full_name || userName); setEmployeeId(data.employee_id || ''); }
    };
    load();
  }, [userId, userName]);

  const handleSaveProfile = async () => {
    setSaving(true);
    await supabase.from('profiles').upsert({ id: userId, full_name: name, employee_id: employeeId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    await supabase.auth.updateUser({ data: { full_name: name } });
    onNameUpdate(name);
    setSaving(false);
    alert('저장되었습니다!');
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) { alert('비밀번호가 일치하지 않습니다.'); return; }
    if (newPassword.length < 6) { alert('비밀번호는 6자 이상이어야 합니다.'); return; }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPw(false);
    if (error) { alert('비밀번호 변경 실패: ' + error.message); return; }
    setNewPassword(''); setConfirmPassword(''); setShowPwForm(false);
    alert('비밀번호가 변경되었습니다!');
  };

  const handleDeleteAccount = async () => {
    const confirm1 = window.confirm('정말 회원 탈퇴하시겠어요?\n탈퇴 후 모든 데이터가 삭제됩니다.');
    if (!confirm1) return;
    const confirm2 = window.confirm('마지막 확인입니다. 정말 탈퇴하시겠어요?');
    if (!confirm2) return;
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="p-6">
      <button onClick={onBack} className="flex items-center gap-1 text-secondary text-sm font-semibold mb-6 hover:text-primary transition-colors">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span> 뒤로
      </button>
      <h3 className="text-xl font-bold text-primary mb-6">내 정보 관리</h3>

      <div className="space-y-4">
        {/* 기본 정보 */}
        <div className="bg-white rounded-xl p-5 border border-secondary/10 space-y-4">
          <h4 className="text-xs font-bold text-outline uppercase tracking-wider">기본 정보</h4>
          <div>
            <label className="text-sm font-semibold text-outline mb-1 block">이름</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-secondary/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/40" />
          </div>
          <div>
            <label className="text-sm font-semibold text-outline mb-1 block">사번</label>
            <input value={employeeId} onChange={e => setEmployeeId(e.target.value)}
              placeholder="사번을 입력해주세요"
              className="w-full border border-secondary/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/40" />
          </div>
          <div>
            <label className="text-sm font-semibold text-outline mb-1 block">아이디 (이메일)</label>
            <input value={email} disabled
              className="w-full border border-secondary/10 rounded-xl px-4 py-3 text-sm bg-surface-container text-outline cursor-not-allowed" />
            <p className="text-xs text-outline/60 mt-1">이메일은 변경할 수 없습니다</p>
          </div>
          <button onClick={handleSaveProfile} disabled={saving}
            className="w-full bg-primary-container text-white py-3 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : null}
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>

        {/* 비밀번호 변경 */}
        <div className="bg-white rounded-xl p-5 border border-secondary/10">
          <h4 className="text-xs font-bold text-outline uppercase tracking-wider mb-4">보안</h4>
          {showPwForm ? (
            <div className="space-y-3">
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="새 비밀번호 (6자 이상)"
                className="w-full border border-secondary/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/40" />
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="새 비밀번호 확인"
                className="w-full border border-secondary/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/40" />
              <div className="flex gap-3">
                <button onClick={() => { setShowPwForm(false); setNewPassword(''); setConfirmPassword(''); }}
                  className="flex-1 py-3 border border-secondary/20 rounded-xl text-sm font-medium text-secondary">취소</button>
                <button onClick={handleChangePassword} disabled={changingPw}
                  className="flex-1 py-3 bg-primary-container text-white rounded-xl text-sm font-bold disabled:opacity-60">
                  {changingPw ? '변경 중...' : '변경 완료'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowPwForm(true)}
              className="w-full flex items-center justify-between py-2 text-on-surface">
              <span className="text-sm font-semibold">비밀번호 변경</span>
              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </button>
          )}
        </div>

        {/* 회원 탈퇴 */}
        <div className="bg-white rounded-xl p-5 border border-error/10">
          <h4 className="text-xs font-bold text-error/60 uppercase tracking-wider mb-4">위험 구역</h4>
          <button onClick={handleDeleteAccount}
            className="w-full py-3 border-2 border-error/30 text-error rounded-xl text-sm font-bold hover:bg-error/5 transition-colors">
            회원 탈퇴
          </button>
          <p className="text-xs text-outline/60 mt-2 text-center">탈퇴 후 모든 데이터는 복구할 수 없습니다</p>
        </div>
      </div>
    </div>
  );
}

// ─── 쿠폰함 뷰 ────────────────────────────────────────────────
function CouponView({ coupons, onBack, onUseCoupon }: any) {
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [isIce, setIsIce] = useState<boolean | null>(null);
  return (
    <div className="p-6">
      <button onClick={onBack} className="flex items-center gap-1 text-secondary text-sm font-semibold mb-6 hover:text-primary transition-colors">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span> 뒤로
      </button>
      <h3 className="text-xl font-bold text-primary mb-2">쿠폰함</h3>
      <p className="text-sm text-outline mb-6">스탬프 10개 달성 시 자동 발급됩니다</p>
      {coupons.length === 0 ? (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">confirmation_number</span>
          <p className="text-on-surface-variant font-medium">사용 가능한 쿠폰이 없어요</p>
        </div>
      ) : (
        <div className="space-y-4">
          {coupons.map((coupon: Coupon) => (
            <div key={coupon.id} className="bg-primary/5 border border-primary/20 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">local_cafe</span>
                <div>
                  <p className="font-bold text-primary">아메리카노 무료 쿠폰</p>
                  <p className="text-xs text-outline mt-0.5">{new Date(coupon.created_at).toLocaleDateString('ko-KR')} 발급</p>
                </div>
              </div>
              {selectedCoupon?.id === coupon.id ? (
                <div>
                  <p className="text-sm font-semibold text-primary mb-3">온도를 선택해주세요</p>
                  <div className="flex gap-3 mb-4">
                    <button onClick={() => setIsIce(false)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${isIce === false ? 'bg-primary-container text-white border-primary-container' : 'border-secondary/30 text-secondary'}`}>☕ 따뜻하게</button>
                    <button onClick={() => setIsIce(true)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${isIce === true ? 'bg-primary-container text-white border-primary-container' : 'border-secondary/30 text-secondary'}`}>🧊 아이스</button>
                  </div>
                  <button onClick={() => isIce !== null && onUseCoupon(coupon, isIce)} disabled={isIce === null}
                    className="w-full bg-primary-container disabled:bg-surface-variant disabled:text-outline text-white py-3 rounded-lg font-bold text-sm">결제하러 가기</button>
                  <button onClick={() => { setSelectedCoupon(null); setIsIce(null); }} className="w-full mt-2 text-sm text-outline py-2">취소</button>
                </div>
              ) : (
                <button onClick={() => setSelectedCoupon(coupon)} className="w-full bg-primary-container text-white py-3 rounded-lg font-bold text-sm hover:bg-primary-container/90 transition-all">쿠폰 사용하기</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 공지사항 뷰 ──────────────────────────────────────────────
function NoticeView({ onBack }: any) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selected, setSelected] = useState<Notice | null>(null);

  useEffect(() => {
    supabase.from('notices').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setNotices(data); });
  }, []);

  return (
    <div className="p-6">
      {selected ? (
        <>
          <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-secondary text-sm font-semibold mb-6 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span> 목록으로
          </button>
          <div className="bg-white rounded-xl p-5 border border-secondary/10">
            {selected.is_pinned && <span className="inline-block bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded mb-3">📌 공지</span>}
            <h4 className="text-lg font-bold text-primary mb-2">{selected.title}</h4>
            <p className="text-xs text-outline mb-4">{new Date(selected.created_at).toLocaleDateString('ko-KR')}</p>
            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{selected.content}</p>
          </div>
        </>
      ) : (
        <>
          <button onClick={onBack} className="flex items-center gap-1 text-secondary text-sm font-semibold mb-6 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span> 뒤로
          </button>
          <h3 className="text-xl font-bold text-primary mb-6">공지사항</h3>
          {notices.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">campaign</span>
              <p className="text-on-surface-variant font-medium">공지사항이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notices.map(n => (
                <button key={n.id} onClick={() => setSelected(n)}
                  className="w-full bg-white rounded-xl p-4 border border-secondary/10 hover:border-primary/20 transition-colors text-left">
                  <div className="flex items-center gap-2 mb-1">
                    {n.is_pinned && <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">📌 공지</span>}
                    <p className="font-semibold text-primary text-sm flex-1">{n.title}</p>
                    <span className="material-symbols-outlined text-outline text-[16px]">chevron_right</span>
                  </div>
                  <p className="text-xs text-outline">{new Date(n.created_at).toLocaleDateString('ko-KR')}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── 고객센터 뷰 ──────────────────────────────────────────────
function InquiryView({ onBack }: any) {
  const [view, setView] = useState<'list' | 'write'>('list');
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchInquiries = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // user_id가 일치하거나 NULL인 것도 포함 (기존 데이터 호환)
    const { data } = await supabase.from('inquiries').select('*')
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('created_at', { ascending: false });
    if (data) setInquiries(data);
  };

  useEffect(() => { fetchInquiries(); }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) { alert('제목과 내용을 입력해주세요.'); return; }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('inquiries').insert({
      user_id: user?.id, user_name: user?.user_metadata?.full_name || '회원',
      title: title.trim(), content: content.trim(),
    });
    setTitle(''); setContent('');
    setSubmitting(false);
    setView('list');
    await fetchInquiries();
    alert('문의가 등록되었습니다!');
  };

  if (selected) {
    return (
      <div className="p-6">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-secondary text-sm font-semibold mb-6">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> 목록으로
        </button>
        <div className="bg-white rounded-xl p-5 border border-secondary/10 mb-4">
          <div className="flex justify-between items-start mb-3">
            <h4 className="text-lg font-bold text-primary">{selected.title}</h4>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selected.is_answered ? 'bg-primary/10 text-primary' : 'bg-surface-variant text-outline'}`}>
              {selected.is_answered ? '답변완료' : '대기중'}
            </span>
          </div>
          <p className="text-xs text-outline mb-4">{new Date(selected.created_at).toLocaleDateString('ko-KR')}</p>
          <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{selected.content}</p>
        </div>
        {selected.is_answered && selected.answer && (
          <div className="bg-primary/5 rounded-xl p-5 border border-primary/10">
            <p className="text-xs font-bold text-primary mb-2">💬 관리자 답변</p>
            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{selected.answer}</p>
          </div>
        )}
      </div>
    );
  }

  if (view === 'write') {
    return (
      <div className="p-6">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-secondary text-sm font-semibold mb-6">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> 뒤로
        </button>
        <h3 className="text-xl font-bold text-primary mb-6">문의 작성</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-outline mb-2 block">제목</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="문의 제목을 입력해주세요"
              className="w-full border border-secondary/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/40" />
          </div>
          <div>
            <label className="text-sm font-semibold text-outline mb-2 block">내용</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="문의 내용을 입력해주세요" rows={6}
              className="w-full border border-secondary/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/40 resize-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setView('list')} className="flex-1 py-3 border border-secondary/20 rounded-xl text-sm font-medium text-secondary">취소</button>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-1 py-3 bg-primary-container text-white rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : null}
              {submitting ? '등록 중...' : '문의 등록'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <button onClick={onBack} className="flex items-center gap-1 text-secondary text-sm font-semibold mb-6">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span> 뒤로
      </button>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-primary">고객센터</h3>
        <button onClick={() => setView('write')} className="bg-primary-container text-white px-4 py-2 rounded-lg text-sm font-bold">문의하기</button>
      </div>
      {inquiries.length === 0 ? (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">help</span>
          <p className="text-on-surface-variant font-medium">문의 내역이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map(inq => (
            <button key={inq.id} onClick={() => setSelected(inq)}
              className="w-full bg-white rounded-xl p-4 border border-secondary/10 hover:border-primary/20 transition-colors text-left">
              <div className="flex justify-between items-center">
                <p className="font-semibold text-primary text-sm">{inq.title}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${inq.is_answered ? 'bg-primary/10 text-primary' : 'bg-surface-variant text-outline'}`}>
                  {inq.is_answered ? '답변완료' : '대기중'}
                </span>
              </div>
              <p className="text-xs text-outline mt-1">{new Date(inq.created_at).toLocaleDateString('ko-KR')}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 설정 뷰 ──────────────────────────────────────────────────
function SettingsView({ onBack }: any) {
  const [autoLogin, setAutoLogin] = useState(true);
  const handleAutoLoginToggle = async () => {
    if (autoLogin) {
      if (!window.confirm('자동 로그인을 해제하면 앱을 다시 열 때 로그인이 필요합니다. 해제하시겠어요?')) return;
      await supabase.auth.signOut();
      window.location.reload();
    }
    setAutoLogin(!autoLogin);
  };

  return (
    <div className="p-6">
      <button onClick={onBack} className="flex items-center gap-1 text-secondary text-sm font-semibold mb-6 hover:text-primary transition-colors">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span> 뒤로
      </button>
      <h3 className="text-xl font-bold text-primary mb-6">설정</h3>
      <div className="space-y-4">
        <div className="bg-white rounded-xl p-5 border border-secondary/10">
          <h4 className="text-xs font-bold text-outline uppercase tracking-wider mb-4">계정</h4>
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold text-on-surface text-sm">자동 로그인</p>
              <p className="text-xs text-outline mt-0.5">앱 실행 시 자동으로 로그인</p>
            </div>
            <button onClick={handleAutoLoginToggle}
              className={`relative w-12 h-6 rounded-full transition-colors ${autoLogin ? 'bg-primary-container' : 'bg-surface-variant'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoLogin ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-secondary/10">
          <h4 className="text-xs font-bold text-outline uppercase tracking-wider mb-4">앱 정보</h4>
          <div className="flex justify-between items-center py-1">
            <p className="text-sm text-on-surface font-medium">앱 버전</p>
            <p className="text-sm text-outline font-semibold">1.0.0</p>
          </div>
          <div className="flex justify-between items-center py-1 mt-2">
            <p className="text-sm text-on-surface font-medium">서비스 이름</p>
            <p className="text-sm text-outline font-semibold">휴엔 새콤달콤</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 웹 로그인 화면 (브라우저 직접 접속 시) ──────────────────
function WebLoginScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) { setError('이메일과 비밀번호를 입력해주세요.'); return; }
    setLoading(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError('이메일 또는 비밀번호를 확인해주세요.'); return; }
    onLogin();
  };

  const handleSignup = async () => {
    if (!name || !email || !password) { setError('모든 항목을 입력해주세요.'); return; }
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return; }
    setLoading(true); setError('');
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
    setLoading(false);
    if (error) { setError(error.message); return; }
    alert('가입 완료! 이메일 인증 후 로그인해주세요.');
    setMode('login');
  };

  return (
    <div className="min-h-screen bg-[#1a2e1b] flex flex-col items-center justify-center px-8 font-['Be_Vietnam_Pro',sans-serif]">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-full bg-[#2d4a2e] border-2 border-[#4a7c4e] flex items-center justify-center mb-4">
            <span className="text-[#c8e6c9] text-2xl font-bold italic">H</span>
          </div>
          <h1 className="text-[#e8f5e9] text-2xl font-bold">휴엔 새콤달콤</h1>
          <p className="text-[#6a9e6d] text-sm mt-1">Premium Organic Cafe</p>
        </div>

        {/* 탭 */}
        <div className="flex bg-[#243d25] rounded-xl p-1 mb-6">
          <button onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'login' ? 'bg-[#4a7c4e] text-white shadow' : 'text-[#6a9e6d]'}`}>
            로그인
          </button>
          <button onClick={() => { setMode('signup'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'signup' ? 'bg-[#4a7c4e] text-white shadow' : 'text-[#6a9e6d]'}`}>
            회원가입
          </button>
        </div>

        {/* 폼 */}
        <div className="bg-[#243d25] rounded-2xl p-6 border border-[#2d4a2e] space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="text-[#a5c8a7] text-xs font-bold mb-1.5 block">이름</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="홍길동"
                className="w-full bg-[#1a2e1b] border border-[#2d4a2e] rounded-xl px-4 py-3 text-[#e8f5e9] text-sm focus:outline-none focus:border-[#4a7c4e]" />
            </div>
          )}
          <div>
            <label className="text-[#a5c8a7] text-xs font-bold mb-1.5 block">이메일</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com"
              type="email" autoCapitalize="none"
              className="w-full bg-[#1a2e1b] border border-[#2d4a2e] rounded-xl px-4 py-3 text-[#e8f5e9] text-sm focus:outline-none focus:border-[#4a7c4e]" />
          </div>
          <div>
            <label className="text-[#a5c8a7] text-xs font-bold mb-1.5 block">비밀번호</label>
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 입력"
              type="password"
              className="w-full bg-[#1a2e1b] border border-[#2d4a2e] rounded-xl px-4 py-3 text-[#e8f5e9] text-sm focus:outline-none focus:border-[#4a7c4e]" />
          </div>

          {error && (
            <p className="text-red-400 text-xs font-medium bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button onClick={mode === 'login' ? handleLogin : handleSignup} disabled={loading}
            className="w-full bg-[#4a7c4e] text-white py-3.5 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2 mt-2 hover:bg-[#4a7c4e]/90 transition-colors">
            {loading ? (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : null}
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
