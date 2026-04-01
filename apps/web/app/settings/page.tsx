'use client';

/**
 * Settings Page - Vuexy Style
 */

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useShop } from '@/lib/shop-context';
import { useLanguage } from '@/lib/language-context';
import { useCurrency, type CurrencyCode } from '@/lib/currency-context';
import { shopsApi, teamApi, userPreferencesApi, currencyApi, type Shop, type ApiError, type TeamMember } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { NotificationModal } from '@/components/modals/NotificationModal';
import {
  Settings as SettingsIcon, Store, Link as LinkIcon, Unlink, CheckCircle, CheckCircle2, XCircle,
  AlertCircle, AlertTriangle, Loader2, Building2, Users, Bell, UserPlus, Trash2, Shield, Eye, Edit, Crown, X, DollarSign, ChevronDown, MessageSquare, Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessagingActivationWizard } from '@/components/settings/MessagingActivationWizard';

type TabType = 'connections' | 'shops' | 'team' | 'notifications' | 'currency' | 'messaging';

function SettingsContent() {
  const { user } = useAuth();
  const { refreshShops } = useShop();
  const { t } = useLanguage();
  const { setCurrency } = useCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as TabType | null;
  const activationToken = searchParams.get('token');
  const [activeTab, setActiveTab] = useState<TabType>(tabParam || 'connections');
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingEtsy, setConnectingEtsy] = useState(false);
  const [shopNameInput, setShopNameInput] = useState('');
  const [editingShopId, setEditingShopId] = useState<number | null>(null);
  const [shopNameDraft, setShopNameDraft] = useState('');
  const [savingShopName, setSavingShopName] = useState(false);
  const [shopAccessMember, setShopAccessMember] = useState<TeamMember | null>(null);
  const [shopAccessSelections, setShopAccessSelections] = useState<number[]>([]);
  const [savingShopAccess, setSavingShopAccess] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'admin' });
  const [inviting, setInviting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [shopToDisconnect, setShopToDisconnect] = useState<{ id: number; name: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDeleteShopModal, setShowDeleteShopModal] = useState(false);
  const [shopToDelete, setShopToDelete] = useState<{ id: number; name: string } | null>(null);
  const [deletingShop, setDeletingShop] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState<string>('USD');
  const [loadingCurrency, setLoadingCurrency] = useState(false);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [supportedCurrencies, setSupportedCurrencies] = useState<string[]>([]);
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);
  const [notification, setNotification] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({ show: false, type: 'success', title: '', message: '' });
  const [messagingConfig, setMessagingConfig] = useState({
    imap_host: '',
    imap_email: '',
    imap_password: '',
    adspower_profile_id: '',
  });
  const [loadingMessaging, setLoadingMessaging] = useState(false);
  const [savingMessaging, setSavingMessaging] = useState(false);
  const [selectedShopForMessaging, setSelectedShopForMessaging] = useState<number | null>(null);

  useEffect(() => { loadShops(); }, []);
  useEffect(() => { if (activeTab === 'team') loadTeamMembers(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'currency') loadCurrencyPrefs(); }, [activeTab]);
  useEffect(() => {
    if (activeTab === 'messaging' && selectedShopForMessaging) {
      loadMessagingConfig(selectedShopForMessaging);
    }
  }, [activeTab, selectedShopForMessaging]);
  // Block Messaging tab when tenant does not have admin approval (unless completing token activation)
  useEffect(() => {
    if (!user) return;
    if (user.messaging_access === 'approved') return;
    if (searchParams.get('token')) return;
    const tab = searchParams.get('tab');
    if (tab === 'messaging' || activeTab === 'messaging') {
      setActiveTab('connections');
      router.replace('/settings?tab=connections');
    }
  }, [user, searchParams, activeTab, router]);

  useEffect(() => {
    if (searchParams.get('etsy') === 'connected') {
      setNotification({
        show: true,
        type: 'success',
        title: t('settings.shopConnected') || 'Shop Connected',
        message: t('settings.shopConnectedMsg') || 'Your Etsy shop has been successfully connected.',
      });
      window.history.replaceState({}, '', '/settings?tab=shops');
    }
  }, [searchParams]);

  const loadCurrencyPrefs = async () => {
    try {
      setLoadingCurrency(true);
      const [prefs, supported] = await Promise.all([
        userPreferencesApi.get(),
        currencyApi.getSupported(),
      ]);
      setPreferredCurrency(prefs.preferred_currency_code);
      setCurrency(prefs.preferred_currency_code as CurrencyCode);
      setSupportedCurrencies(supported.currencies || []);
    } catch {
      setSupportedCurrencies(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'ILS', 'JPY', 'MXN', 'BRL']);
    } finally {
      setLoadingCurrency(false);
    }
  };

  const saveCurrencyPreference = async () => {
    try {
      setSavingCurrency(true);
      const updated = await userPreferencesApi.update(preferredCurrency);
      setPreferredCurrency(updated.preferred_currency_code);
      setCurrency(updated.preferred_currency_code as CurrencyCode);
      setNotification({
        show: true,
        type: 'success',
        title: t('settings.currencySaved'),
        message: t('settings.currencySavedMessage').replace('{currency}', preferredCurrency),
      });
    } catch (err) {
      setNotification({
        show: true,
        type: 'error',
        title: t('settings.saveFailed'),
        message: (err as ApiError).detail || t('settings.currencySaveFailed'),
      });
    } finally {
      setSavingCurrency(false);
    }
  };

  const loadMessagingConfig = async (shopId: number) => {
    try {
      setLoadingMessaging(true);
      const data = await shopsApi.getMessagingConfig(shopId);
      setMessagingConfig({
        imap_host: data.imap_host || '',
        imap_email: data.imap_email || '',
        imap_password: '',
        adspower_profile_id: data.adspower_profile_id || '',
      });
    } catch {
      // Leave form empty on error or 404
    } finally {
      setLoadingMessaging(false);
    }
  };

  const saveMessagingConfig = async () => {
    if (!selectedShopForMessaging) return;
    try {
      setSavingMessaging(true);
      await shopsApi.updateMessagingConfig(selectedShopForMessaging, messagingConfig);
      setNotification({
        show: true,
        type: 'success',
        title: 'Messaging Config Saved',
        message: 'IMAP and AdsPower settings saved successfully.',
      });
    } catch {
      setNotification({
        show: true,
        type: 'error',
        title: 'Save Failed',
        message: 'Could not save messaging configuration.',
      });
    } finally {
      setSavingMessaging(false);
    }
  };

  // Update active tab when URL parameter changes
  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const loadShops = async () => {
    try { setIsLoading(true); setError(null); const data = await shopsApi.getAll(); setShops(Array.isArray(data) ? data : []); }
    catch (err) { setError((err as ApiError).detail || t('settings.loadShopsFailed')); setShops([]); }
    finally { setIsLoading(false); }
  };

  const [linkCopied, setLinkCopied] = useState(false);
  const [showConnectLinkModal, setShowConnectLinkModal] = useState(false);
  const [generatedConnectUrl, setGeneratedConnectUrl] = useState('');
  const [connectLinkCopied, setConnectLinkCopied] = useState(false);

  const handleConnectEtsy = async () => {
    try {
      setConnectingEtsy(true);
      setError(null);
      const { connect_url } = await shopsApi.createConnectLink(shopNameInput || undefined);
      setGeneratedConnectUrl(connect_url);
      setShowConnectLinkModal(true);
      setConnectLinkCopied(false);
    } catch (err) {
      setError((err as ApiError).detail || t('settings.generateLinkFailed'));
    } finally {
      setConnectingEtsy(false);
    }
  };

  const handleCopyConnectLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedConnectUrl);
      setConnectLinkCopied(true);
      setTimeout(() => setConnectLinkCopied(false), 4000);
    } catch {
      setError(t('settings.copyFailed'));
    }
  };

  const handleStartRename = (shopId: number, currentName: string) => {
    setShopNameDraft(currentName || '');
    setEditingShopId(shopId);
  };

  const handleCancelRename = () => {
    setEditingShopId(null);
    setShopNameDraft('');
  };

  const handleSaveRename = async (shopId: number) => {
    if (!shopNameDraft.trim()) {
      setError(t('settings.shopNameRequired'));
      return;
    }
    try {
      setSavingShopName(true);
      setError(null);
      await shopsApi.updateDisplayName(shopId, shopNameDraft.trim());
      setEditingShopId(null);
      await loadShops();
    } catch (err) {
      setError((err as ApiError).detail || t('settings.updateShopNameFailed'));
    } finally {
      setSavingShopName(false);
    }
  };

  const openShopAccessModal = (member: TeamMember) => {
    setShopAccessMember(member);
    setShopAccessSelections(member.allowed_shop_ids || []);
  };

  const closeShopAccessModal = () => {
    setShopAccessMember(null);
    setShopAccessSelections([]);
  };

  const saveShopAccess = async () => {
    if (!shopAccessMember) return;
    try {
      setSavingShopAccess(true);
      setError(null);
      await teamApi.updateShopAccess(shopAccessMember.user_id, shopAccessSelections);
      await loadTeamMembers();
      closeShopAccessModal();
    } catch (err: any) {
      setError((err as ApiError).detail || t('settings.updateShopAccessFailed'));
    } finally {
      setSavingShopAccess(false);
    }
  };

  const handleDisconnectShop = async (shopId: number, shopName: string) => {
    setShopToDisconnect({ id: shopId, name: shopName });
    setShowDisconnectModal(true);
  };

  const handleDeleteShop = (shopId: number, shopName: string) => {
    setShopToDelete({ id: shopId, name: shopName });
    setDeleteConfirmText('');
    setShowDeleteShopModal(true);
  };

  const confirmDeleteShop = async () => {
    if (!shopToDelete) return;
    try {
      setDeletingShop(true);
      await shopsApi.deletePermanently(shopToDelete.id);
      setShowDeleteShopModal(false);
      setNotification({
        show: true,
        type: 'success',
        title: t('settings.shopDeleted'),
        message: t('settings.shopDeletedMessage').replace('{name}', shopToDelete.name)
      });
      setShopToDelete(null);
      setDeleteConfirmText('');
      await loadShops();
      refreshShops();
    } catch (err) {
      setNotification({
        show: true,
        type: 'error',
        title: t('settings.deletionFailed'),
        message: (err as ApiError).detail || t('settings.deleteShopFailed')
      });
    } finally {
      setDeletingShop(false);
    }
  };

  const confirmDisconnectShop = async () => {
    if (!shopToDisconnect) return;
    try {
      setDisconnecting(true);
      await shopsApi.disconnect(shopToDisconnect.id);
      setShowDisconnectModal(false);
      setNotification({
        show: true,
        type: 'success',
        title: t('settings.shopDisconnected'),
        message: t('settings.shopDisconnectedMessage').replace('{name}', shopToDisconnect.name)
      });
      setShopToDisconnect(null);
      await loadShops();
    } catch (err) {
      setNotification({
        show: true,
        type: 'error',
        title: t('settings.disconnectionFailed'),
        message: (err as ApiError).detail || t('settings.disconnectFailed')
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const loadTeamMembers = async () => {
    try { setLoadingTeam(true); setError(null); const members = await teamApi.getMembers(); setTeamMembers(members); }
    catch (err) { setError((err as ApiError).detail || t('settings.loadFailed')); } finally { setLoadingTeam(false); }
  };

  const handleInviteMember = async () => {
    if (!inviteForm.email || !inviteForm.name) {
      setNotification({
        show: true,
        type: 'error',
        title: t('settings.missingInformation'),
        message: t('settings.fillAllFields')
      });
      return;
    }
    try {
      setInviting(true);
      setError(null);
      await teamApi.inviteMember(inviteForm);
      setShowInviteModal(false);
      setInviteForm({ email: '', name: '', role: 'admin' });
      setNotification({
        show: true,
        type: 'success',
        title: t('settings.invitationSent'),
        message: t('settings.invitationSentMessage').replace('{email}', inviteForm.email)
      });
      await loadTeamMembers();
    } catch (err) {
      setNotification({
        show: true,
        type: 'error',
        title: t('settings.invitationFailed'),
        message: (err as ApiError).detail || t('settings.sendInvitationFailed')
      });
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: number, name: string) => {
    setMemberToDelete({ id: userId, name });
    setShowDeleteModal(true);
  };

  const confirmRemoveMember = async () => {
    if (!memberToDelete) return;
    try {
      setDeleting(true);
      setError(null);
      await teamApi.removeMember(memberToDelete.id);
      setShowDeleteModal(false);
      setNotification({
        show: true,
        type: 'success',
        title: t('settings.memberRemoved'),
        message: t('settings.memberRemovedMessage').replace('{name}', memberToDelete.name)
      });
      setMemberToDelete(null);
      await loadTeamMembers();
    } catch (err) {
      setNotification({
        show: true,
        type: 'error',
        title: t('settings.removalFailed'),
        message: (err as ApiError).detail || t('settings.removeMemberFailed')
      });
    } finally {
      setDeleting(false);
    }
  };

  const getRoleColor = (role: string) => ({
    owner: 'text-[var(--warning)] bg-[var(--warning-bg)]',
    admin: 'text-[var(--primary)] bg-[var(--primary-bg)]',
    viewer: 'text-[var(--text-muted)] bg-[var(--background)]',
    supplier: 'text-[var(--success)] bg-[var(--success-bg)]',
  }[role] || 'text-[var(--text-muted)] bg-[var(--background)]');
  const getRoleIcon = (role: string) => ({
    owner: <Crown className="w-4 h-4" />,
    admin: <Shield className="w-4 h-4" />,
    viewer: <Eye className="w-4 h-4" />,
    supplier: <Package className="w-4 h-4" />,
  }[role] || <Users className="w-4 h-4" />);
  const getShopAccessLabel = (member: TeamMember) => {
    if (member.role === 'owner' || member.role === 'admin') return t('settings.allShops');
    const count = member.allowed_shop_ids?.length || 0;
    if (count === 0) return t('settings.noShops');
    return count > 1
      ? t('settings.shopCountPlural').replace('{count}', String(count))
      : t('settings.shopCount').replace('{count}', String(count));
  };

  const canManageTeam = user?.role === 'owner' || user?.role === 'admin';
  const messagingApproved = user?.messaging_access === 'approved';
  const showMessagingTab = messagingApproved || !!activationToken;
  const etsyShop = Array.isArray(shops) ? shops.find(s => s.status === 'connected') : null;
  const tabs = [
    { id: 'connections' as TabType, label: t('settings.tabs.connections'), icon: LinkIcon },
    { id: 'shops' as TabType, label: t('settings.tabs.shops'), icon: Store },
    { id: 'team' as TabType, label: t('settings.tabs.team'), icon: Users },
    { id: 'currency' as TabType, label: t('settings.tabs.currency'), icon: DollarSign },
    { id: 'messaging' as TabType, label: 'Messaging', icon: MessageSquare },
    { id: 'notifications' as TabType, label: t('settings.tabs.notifications'), icon: Bell }
  ].filter((tab) => tab.id !== 'messaging' || showMessagingTab);


  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-lg shadow-[var(--primary)]/30">
          <SettingsIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t('settings.title')}</h1>
          <p className="text-[var(--text-muted)]">{t('settings.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border-color)]">
        {tabs.map(tab => (
          <button 
            key={tab.id} 
            onClick={() => {
              setActiveTab(tab.id);
              router.push(`/settings?tab=${tab.id}`);
            }} 
            className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative', activeTab === tab.id ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}
          >
            <tab.icon className="w-4 h-4" />{tab.label}
            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />}
          </button>
        ))}
      </div>

      {error && <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 rounded-xl p-4 flex items-start gap-3"><AlertCircle className="w-5 h-5 text-[var(--danger)]" /><p className="text-[var(--danger)] text-sm">{error}</p></div>}

      {activeTab === 'connections' && (
        <div className="space-y-6">
          <DashboardCard>
            <div className="flex items-center gap-3 mb-4"><Building2 className="w-5 h-5 text-[var(--primary)]" /><h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.organization')}</h2></div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-[var(--text-muted)]">{t('common.name')}</p><p className="text-[var(--text-primary)] font-medium">{user?.tenant_name}</p></div>
              <div><p className="text-sm text-[var(--text-muted)]">{t('settings.yourRole')}</p><p className="text-[var(--text-primary)] font-medium capitalize">{user?.role}</p></div>
            </div>
          </DashboardCard>
        </div>
      )}

      {activeTab === 'shops' && (
        <div className="space-y-6">
          <DashboardCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3"><Store className="w-5 h-5 text-[var(--warning)]" /><h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.etsyShop')}</h2></div>
              {etsyShop ? <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--success-bg)] text-[var(--success)] rounded-full text-sm"><CheckCircle className="w-4 h-4" />{t('common.connected')}</div> : <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--background)] text-[var(--text-muted)] rounded-full text-sm"><XCircle className="w-4 h-4" />{t('common.notConnected')}</div>}
            </div>
            {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-[var(--primary)] animate-spin" /></div>
            : (
              <div className="space-y-4">
                <p className="text-[var(--text-muted)] text-sm">{t('settings.connectEtsyDescription')}</p>
                    {/* Etsy Attribution Notice - Required by Etsy API Terms */}
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-4">
                      The term &ldquo;Etsy&rdquo; is a trademark of Etsy, Inc. This application
                      uses the Etsy API but is not endorsed or certified by Etsy, Inc.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        value={shopNameInput}
                        onChange={(e) => setShopNameInput(e.target.value)}
                        placeholder={t('settings.shopDisplayName')}
                        className="flex-1 px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
                      />
                      <button onClick={handleConnectEtsy} disabled={connectingEtsy} className="flex items-center gap-2 px-5 py-2.5 bg-[var(--warning)] text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                        {connectingEtsy ? <><Loader2 className="w-4 h-4 animate-spin" />{t('settings.generating')}</> : <><LinkIcon className="w-4 h-4" />{t('settings.createConnectionLink')}</>}
                      </button>
                    </div>
              </div>
            )}
          </DashboardCard>

          {shops.length > 0 && (
            <DashboardCard>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.yourShops')}</h2>
                <span className="text-sm text-[var(--text-muted)]">{shops.length} {t('common.total')}</span>
              </div>
              <div className="space-y-3">
                {shops.map((shop) => (
                  <div key={shop.id} className="p-4 bg-[var(--background)] rounded-xl border border-[var(--border-color)]">
                    <div className="flex items-center justify-between gap-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">{t('settings.shopName')}</p>
                          {editingShopId === shop.id ? (
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                value={shopNameDraft}
                                onChange={(e) => setShopNameDraft(e.target.value)}
                                className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
                              />
                              <button
                                onClick={() => handleSaveRename(shop.id)}
                                disabled={savingShopName}
                                className="px-3 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                              >
                                {savingShopName ? t('common.saving') : t('common.save')}
                              </button>
                              <button
                                onClick={handleCancelRename}
                                className="px-3 py-2 bg-[var(--background)] text-[var(--text-muted)] rounded-lg border border-[var(--border-color)]"
                              >
                                {t('common.cancel')}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="text-[var(--text-primary)] font-medium">{shop.display_name || t('settings.unnamedShop')}</p>
                              <button
                                onClick={() => handleStartRename(shop.id, shop.display_name || '')}
                                className="text-[var(--primary)] text-sm hover:underline"
                              >
                                {t('common.rename')}
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">{t('settings.shopId')}</p>
                          <p className="text-[var(--text-primary)] font-mono text-sm">{shop.etsy_shop_id}</p>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">{t('common.status')}</p>
                          <div className="flex items-center gap-2">
                            {shop.status === 'connected' && shop.token_health?.token_valid ? (
                              <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--success-bg)] text-[var(--success)] rounded-full text-sm">
                                <CheckCircle className="w-4 h-4" />{t('common.connected')}
                              </span>
                            ) : shop.status === 'revoked' || (shop.status === 'connected' && shop.token_health && !shop.token_health.token_valid) ? (
                              <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-full text-sm">
                                <AlertTriangle className="w-4 h-4" />{shop.status === 'revoked' ? 'Revoked' : 'Token Expired'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--background)] text-[var(--text-muted)] rounded-full text-sm">
                                <XCircle className="w-4 h-4" />{t('common.notConnected')}
                              </span>
                            )}
                            {shop.token_health?.last_refreshed_at && (
                              <p className="text-[var(--text-muted)] text-xs mt-1">
                                Last refreshed: {new Date(shop.token_health.last_refreshed_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      {user?.role !== 'member' && user?.role !== 'viewer' && (
                        <div className="flex items-center gap-2">
                          {shop.status === 'connected' ? (
                            <button onClick={() => handleDisconnectShop(shop.id, shop.display_name)} className="flex items-center gap-2 px-4 py-2.5 bg-[var(--danger-bg)] text-[var(--danger)] rounded-lg hover:bg-[var(--danger)]/20">
                              <Unlink className="w-4 h-4" />{t('common.disconnect')}
                            </button>
                          ) : (
                            <button onClick={handleConnectEtsy} disabled={connectingEtsy} className="flex items-center gap-2 px-4 py-2.5 bg-[var(--warning)] text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                              <LinkIcon className="w-4 h-4" />{t('common.reconnect')}
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteShop(shop.id, shop.display_name || shop.etsy_shop_id)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-red-800 text-white rounded-lg hover:bg-red-900 transition-colors"
                            title={t('settings.deleteShopTooltip')}
                          >
                            <Trash2 className="w-4 h-4" />{t('common.delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </DashboardCard>
          )}
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-6">
          <DashboardCard>
            <div className="flex items-center justify-between mb-6">
              <div><h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.teamMembers')}</h2><p className="text-sm text-[var(--text-muted)] mt-1">{t('settings.manageAccess')}</p></div>
              {canManageTeam && <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2 px-4 py-2.5 gradient-primary text-white rounded-lg shadow-lg shadow-[var(--primary)]/25"><UserPlus className="w-4 h-4" />{t('settings.invite')}</button>}
            </div>
            {loadingTeam ? <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-[var(--primary)] animate-spin" /></div> : (
              <div className="space-y-3">
                {teamMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-4 bg-[var(--background)] rounded-xl border border-[var(--border-color)]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-semibold">{member.name.charAt(0)}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[var(--text-primary)] font-medium">{member.name}</p>
                          {member.user_id === user?.id && <span className="px-2 py-0.5 bg-[var(--primary-bg)] text-[var(--primary)] text-xs rounded">{t('common.you')}</span>}
                          {member.invitation_status === 'pending' && (
                            <span className="px-2 py-0.5 bg-[var(--warning-bg)] text-[var(--warning)] text-xs rounded flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {t('common.pending')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--text-muted)]">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full', getRoleColor(member.role))}>{getRoleIcon(member.role)}<span className="text-sm font-medium capitalize">{member.role}</span></div>
                      <span className="px-2 py-1 rounded-full text-xs bg-[var(--background)] text-[var(--text-muted)] border border-[var(--border-color)]">
                        {getShopAccessLabel(member)}
                      </span>
                      {canManageTeam && member.user_id !== user?.id && (member.role === 'viewer' || member.role === 'member') && (
                        <button
                          onClick={() => openShopAccessModal(member)}
                          className="px-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          {t('settings.shopAccess')}
                        </button>
                      )}
                      {canManageTeam && member.user_id !== user?.id && <button onClick={() => handleRemoveMember(member.user_id, member.name)} className="p-2 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] rounded-lg"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>

          {/* Role Descriptions */}
          <DashboardCard>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.teamRoles')}</h2>
              <p className="text-sm text-[var(--text-muted)] mt-1">{t('settings.rolesDescription')}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex gap-4 p-4 bg-[var(--background)] rounded-xl border border-[var(--border-color)]">
                <div className={cn('flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0', getRoleColor('owner'))}>
                  {getRoleIcon('owner')}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-[var(--text-primary)]">{t('settings.roles.owner')}</h3>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">
                    {t('settings.roles.ownerDescription')}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 p-4 bg-[var(--background)] rounded-xl border border-[var(--border-color)]">
                <div className={cn('flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0', getRoleColor('admin'))}>
                  {getRoleIcon('admin')}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-[var(--text-primary)]">{t('settings.roles.admin')}</h3>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">
                    {t('settings.roles.adminDescription')}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 p-4 bg-[var(--background)] rounded-xl border border-[var(--border-color)]">
                <div className={cn('flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0', getRoleColor('viewer'))}>
                  {getRoleIcon('viewer')}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-[var(--text-primary)]">{t('settings.roles.viewer')}</h3>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">
                    {t('settings.roles.viewerDescription')}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-[var(--background)] rounded-xl border border-[var(--border-color)]">
                <div className={cn('flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0', getRoleColor('supplier'))}>
                  {getRoleIcon('supplier')}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-[var(--text-primary)]">ספק</h3>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">
                    גישה להזמנות בלבד. יכול לראות פרטי הזמנות ולמלא מספרי מעקב. אינו רואה מחירים, מוצרים או נתוני חנות.
                  </p>
                </div>
              </div>
            </div>
          </DashboardCard>
        </div>
      )}

      {activeTab === 'currency' && (
        <div className="space-y-6">
          <DashboardCard>
            <div className="flex items-center gap-3 mb-4">
              <DollarSign className="w-5 h-5 text-[var(--primary)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.currencyPreferences')}</h2>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-6">{t('settings.currencyPreferencesDesc')}</p>
            {loadingCurrency ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[var(--primary)] animate-spin" /></div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-1 max-w-xs">
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">{t('settings.preferredCurrency')}</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCurrencyDropdownOpen(!currencyDropdownOpen)}
                      onBlur={() => setTimeout(() => setCurrencyDropdownOpen(false), 150)}
                      className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-left hover:border-[var(--primary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-colors"
                    >
                      <span className="font-medium">{preferredCurrency}</span>
                      <ChevronDown className={cn('w-4 h-4 text-[var(--text-muted)] transition-transform', currencyDropdownOpen && 'rotate-180')} />
                    </button>
                    {currencyDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setCurrencyDropdownOpen(false)}
                          aria-hidden="true"
                        />
                        <div className="absolute left-0 right-0 mt-1 z-50 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                          {(supportedCurrencies.length ? supportedCurrencies : ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'ILS', 'JPY', 'MXN', 'BRL']).map((ccy) => (
                            <button
                              key={ccy}
                              type="button"
                              onClick={() => {
                                setPreferredCurrency(ccy);
                                setCurrencyDropdownOpen(false);
                              }}
                              className={cn(
                                'w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors',
                                preferredCurrency === ccy
                                  ? 'bg-[var(--primary-bg)] text-[var(--primary)] font-medium'
                                  : 'text-[var(--text-secondary)] hover:bg-[var(--background)] hover:text-[var(--text-primary)]'
                              )}
                            >
                              {ccy}
                              {preferredCurrency === ccy && <CheckCircle className="w-4 h-4 text-[var(--primary)]" />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex sm:pb-0.5">
                  <button
                    onClick={saveCurrencyPreference}
                    disabled={savingCurrency}
                    className="px-5 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium transition-colors"
                  >
                    {savingCurrency ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>
            )}
          </DashboardCard>
        </div>
      )}

      {activeTab === 'messaging' && activationToken && (
        <MessagingActivationWizard token={activationToken} />
      )}

      {activeTab === 'messaging' && !activationToken && messagingApproved && (
        <div className="space-y-6">
          <DashboardCard>
            <div className="flex items-center gap-3 mb-4">
              <MessageSquare className="w-5 h-5 text-[var(--primary)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Messaging Automation</h2>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Configure IMAP email monitoring and AdsPower browser profile per shop to enable automated message reading and replies.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Select Shop</label>
              <select
                value={selectedShopForMessaging || ''}
                onChange={(e) => setSelectedShopForMessaging(Number(e.target.value))}
                className="w-full max-w-xs px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="">-- Select a shop --</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>{s.display_name || s.etsy_shop_id}</option>
                ))}
              </select>
            </div>

            {selectedShopForMessaging && (
              loadingMessaging ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[var(--primary)] animate-spin" /></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-[var(--text-muted)] mb-1">IMAP Host</p>
                    <input
                      value={messagingConfig.imap_host}
                      onChange={(e) => setMessagingConfig({ ...messagingConfig, imap_host: e.target.value })}
                      placeholder="imap.gmail.com"
                      className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <p className="text-sm text-[var(--text-muted)] mb-1">IMAP Email</p>
                    <input
                      value={messagingConfig.imap_email}
                      onChange={(e) => setMessagingConfig({ ...messagingConfig, imap_email: e.target.value })}
                      placeholder="shop@gmail.com"
                      className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <p className="text-sm text-[var(--text-muted)] mb-1">App Password</p>
                    <input
                      type="password"
                      value={messagingConfig.imap_password}
                      onChange={(e) => setMessagingConfig({ ...messagingConfig, imap_password: e.target.value })}
                      placeholder="Leave blank to keep existing"
                      className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <p className="text-sm text-[var(--text-muted)] mb-1">AdsPower Profile ID</p>
                    <input
                      value={messagingConfig.adspower_profile_id}
                      onChange={(e) => setMessagingConfig({ ...messagingConfig, adspower_profile_id: e.target.value })}
                      placeholder="e.g. jd8k2m"
                      className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <button
                      onClick={saveMessagingConfig}
                      disabled={savingMessaging}
                      className="px-5 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      {savingMessaging ? 'Saving...' : 'Save Messaging Config'}
                    </button>
                  </div>
                </div>
              )
            )}
          </DashboardCard>
        </div>
      )}

      {activeTab === 'messaging' && !activationToken && !messagingApproved && (
        <DashboardCard>
          <div className="py-8 text-center text-[var(--text-muted)] text-sm">
            You don&apos;t have messaging access yet. Contact support at{' '}
            <a href="mailto:support@etsyauto.com" className="text-[var(--primary)] font-medium">support@etsyauto.com</a>{' '}
            to request access.
          </div>
        </DashboardCard>
      )}

      {activeTab === 'notifications' && <DashboardCard><div className="text-center py-12"><Bell className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" /><p className="text-[var(--text-muted)]">{t('settings.comingSoon')}</p></div></DashboardCard>}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6"><h2 className="text-xl font-bold text-[var(--text-primary)]">{t('settings.inviteMember')}</h2><button onClick={() => setShowInviteModal(false)} className="text-[var(--text-muted)]"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">{t('common.name')}</label><input type="text" value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} placeholder="שם פרטי" className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" /></div>
              <div><label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">{t('common.email')}</label><input type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="example@email.com" className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" /></div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">{t('common.role')}</label>
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
                  className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <option value="admin">מנהל — גישה מלאה לכל</option>
                  <option value="viewer">צופה — צפייה בלבד</option>
                  <option value="supplier">ספק — הזמנות בלבד</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowInviteModal(false)} className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg">{t('common.cancel')}</button>
              <button onClick={handleInviteMember} disabled={inviting} className="flex-1 px-4 py-3 gradient-primary text-white rounded-lg disabled:opacity-50 shadow-lg shadow-[var(--primary)]/25">{inviting ? t('settings.inviting') : t('common.send')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Shop Access Modal */}
      {shopAccessMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">{t('settings.shopAccess')}</h2>
              <button onClick={closeShopAccessModal} className="text-[var(--text-muted)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              {t('settings.selectShopsMessage').replace('{name}', shopAccessMember.name)}
            </p>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {shops.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t('settings.noShopsConnected')}</p>
              ) : (
                shops.map((shop) => (
                  <label key={shop.id} className="flex items-center gap-3 p-3 bg-[var(--background)] rounded-lg border border-[var(--border-color)]">
                    <input
                      type="checkbox"
                      checked={shopAccessSelections.includes(shop.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setShopAccessSelections((prev) => [...prev, shop.id]);
                        } else {
                          setShopAccessSelections((prev) => prev.filter((id) => id !== shop.id));
                        }
                      }}
                    />
                    <div>
                      <p className="text-[var(--text-primary)] font-medium">{shop.display_name || t('settings.unnamedShop')}</p>
                      <p className="text-xs text-[var(--text-muted)]">{shop.etsy_shop_id}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeShopAccessModal} className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg">{t('common.cancel')}</button>
              <button onClick={saveShopAccess} disabled={savingShopAccess} className="flex-1 px-4 py-3 gradient-primary text-white rounded-lg disabled:opacity-50 shadow-lg shadow-[var(--primary)]/25">
                {savingShopAccess ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Shop Confirmation Modal */}
      <ConfirmModal
        isOpen={showDisconnectModal}
        onClose={() => {
          setShowDisconnectModal(false);
          setShopToDisconnect(null);
        }}
        onConfirm={confirmDisconnectShop}
        title={t('settings.disconnectTitle')}
        message={t('settings.disconnectMessage').replace('{name}', shopToDisconnect?.name || 'this shop')}
        confirmText={t('settings.disconnectShop')}
        cancelText={t('common.cancel')}
        variant="warning"
        isProcessing={disconnecting}
      />

      {/* Delete Member Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setMemberToDelete(null);
        }}
        onConfirm={confirmRemoveMember}
        title={t('settings.removeMemberTitle')}
        message={t('settings.removeMemberMessage').replace('{name}', memberToDelete?.name || 'this member')}
        confirmText={t('settings.removeMember')}
        cancelText={t('common.cancel')}
        variant="danger"
        isProcessing={deleting}
      />

      {/* Connection Link Modal */}
      {showConnectLinkModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.connectionLinkCreated')}</h3>
              <button onClick={() => setShowConnectLinkModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              {t('settings.shareLinkMessage')}
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={generatedConnectUrl}
                className="flex-1 px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm font-mono"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopyConnectLink}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 flex-shrink-0"
              >
                {connectLinkCopied ? <><CheckCircle2 className="w-4 h-4" />{t('settings.copied')}</> : <><LinkIcon className="w-4 h-4" />{t('settings.copyLink')}</>}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{t('settings.linkExpires')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Delete Shop Confirmation Modal */}
      {showDeleteShopModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.deleteShopTitle')}</h3>
                <p className="text-sm text-[var(--text-muted)]">{t('settings.deleteShopWarning')}</p>
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-sm text-red-400">
                {t('settings.deleteShopMessage').replace('{name}', shopToDelete?.name || '')}
              </p>
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">
                {`Type ${(shopToDelete?.name || '').toUpperCase()} to confirm`}
              </label>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={(shopToDelete?.name || '').toUpperCase()}
                className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDeleteShopModal(false); setShopToDelete(null); setDeleteConfirmText(''); }}
                className="px-4 py-2.5 bg-[var(--background)] text-[var(--text-muted)] rounded-lg border border-[var(--border-color)] hover:text-[var(--text-primary)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmDeleteShop}
                disabled={deleteConfirmText !== (shopToDelete?.name || '').toUpperCase() || deletingShop}
                className="px-4 py-2.5 bg-red-800 text-white rounded-lg hover:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deletingShop ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deletingShop ? t('settings.deleting') : t('settings.deletePermanently')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      <NotificationModal
        isOpen={notification.show}
        onClose={() => setNotification({ ...notification, show: false })}
        title={notification.title}
        message={notification.message}
        type={notification.type}
        autoClose={true}
        autoCloseDuration={4000}
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <React.Suspense fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
        </div>
      }>
        <SettingsContent />
      </React.Suspense>
    </DashboardLayout>
  );
}
