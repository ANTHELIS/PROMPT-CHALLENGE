import React, { useState, useEffect, useRef } from 'react';
import { User, CropListing, Message } from '../types';
import { api } from '../api';
import { getMarketInsight, translateText } from '../services/geminiService';
import LiveAssistant from '../components/LiveAssistant';
import { TRANSLATIONS } from '../constants';
import { Sprout, TrendingUp, Edit2, MessageCircle, Phone, ArrowLeft, Plus, Trash2, LogOut, User as UserIcon } from 'lucide-react';
import { FunctionDeclaration, Type } from '@google/genai';

interface Props {
    user: User;
    listings: CropListing[];
    onAddListing: (listing: Omit<CropListing, 'id'>) => void;
    onUpdateListing: (listing: CropListing) => void;
    onDeleteListing: (listingId: string) => void;
    onUpdateUser: (updates: Partial<User>) => void;
    onLogout: () => void;
}

const FarmerDashboard: React.FC<Props> = ({ user, listings, onAddListing, onUpdateListing, onDeleteListing, onUpdateUser, onLogout }) => {
    const [view, setView] = useState<'home' | 'create' | 'edit' | 'chat' | 'profile'>('home');
    const [activeTab, setActiveTab] = useState<'my_listings' | 'inbox'>('my_listings');
    const [insight, setInsight] = useState<any>(null);
    const [formState, setFormState] = useState<Partial<CropListing>>({});
    const [editingId, setEditingId] = useState<string | null>(null);
    const [inboxItems, setInboxItems] = useState<{ partnerId: string, name: string, lastMsg: string }[]>([]);
    const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
    const [profileData, setProfileData] = useState({ name: '' });

    // Keep a ref of listings to access inside the Voice Session closure
    const listingsRef = useRef(listings);
    useEffect(() => {
        listingsRef.current = listings;
    }, [listings]);

    // Chat State
    const [messages, setMessages] = useState<Message[]>([]);
    const messagesRef = useRef(messages);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Poll for messages
    useEffect(() => {
        const fetchMessages = async () => {
            if (user.id) {
                const msgs = await api.getMessages(user.id);
                setMessages(msgs);
            }
        };

        fetchMessages();
        const interval = setInterval(fetchMessages, 3000); // Poll every 3 seconds
        return () => clearInterval(interval);
    }, [user.id]);

    useEffect(() => {
        const processInbox = async () => {
            // Get unique partners
            const partners = new Set<string>();
            messages.forEach(m => {
                if (m.senderId !== user.id) partners.add(m.senderId);
                if (m.receiverId === user.id && m.senderId) partners.add(m.senderId); // Same as above
                if (m.senderId === user.id && m.receiverId) partners.add(m.receiverId);
            });
            // Filter out self and known bots if desired, though bots might be valid
            partners.delete(user.id);

            const items = [];
            for (const pid of Array.from(partners)) {
                if (!pid) continue;
                // Try to get name. Ideally cache this or use api.getUser
                // For 'buyer_1', api.getUser returns null (404/500), so we handle that
                let name = pid;
                if (pid === 'buyer_1') name = "Manoj (Demo)";
                else {
                    const u = await api.getUser(pid);
                    if (u) name = u.name;
                }

                const relevant = messages.filter(m => m.senderId === pid || m.receiverId === pid);
                const last = relevant[relevant.length - 1];
                items.push({ partnerId: pid, name, lastMsg: last?.text || '' });
            }
            setInboxItems(items);
        };
        processInbox();
    }, [messages, user.id]);

    const [newMessage, setNewMessage] = useState('');

    // Translations Helper
    const t = (key: keyof typeof TRANSLATIONS['en']) => {
        return TRANSLATIONS[user.language][key] || TRANSLATIONS['en'][key];
    };

    const myListings = listings.filter(l => l.farmerId === user.id);

    // --- Voice Tools Configuration ---
    const tools: FunctionDeclaration[] = [
        {
            name: 'create_listing',
            description: 'Create a new crop listing with name, quantity, and price.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    cropName: { type: Type.STRING, description: "Name of the crop e.g. Onion" },
                    quantity: { type: Type.NUMBER, description: "Quantity in KG" },
                    price: { type: Type.NUMBER, description: "Price per KG in Rupees" },
                    location: { type: Type.STRING, description: "City or Village name" }
                },
                required: ['cropName', 'quantity', 'price']
            }
        },
        {
            name: 'delete_listing',
            description: 'Delete a crop listing by its name.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    cropName: { type: Type.STRING, description: "Name of the crop to delete" }
                },
                required: ['cropName']
            }
        },
        {
            name: 'update_listing',
            description: 'Update price or quantity of an existing listing.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    cropName: { type: Type.STRING, description: "Name of the crop to update" },
                    newPrice: { type: Type.NUMBER },
                    newQuantity: { type: Type.NUMBER }
                },
                required: ['cropName']
            }
        },
        {
            name: 'get_my_listings',
            description: 'Get the list of current crops listed by the farmer. Use this to summarize.',
            parameters: {
                type: Type.OBJECT,
                properties: {},
            }
        },
        {
            name: 'check_inbox',
            description: 'Check if there are any messages or orders from buyers. Returns a summary of inquiries.',
            parameters: {
                type: Type.OBJECT,
                properties: {},
            }
        },
        {
            name: 'read_latest_messages',
            description: 'Read the actual content of the messages from the buyer.',
            parameters: {
                type: Type.OBJECT,
                properties: {},
            }
        },
        {
            name: 'send_reply',
            description: 'Send a message reply to the buyer.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    message: { type: Type.STRING, description: "The message content to send" }
                },
                required: ['message']
            }
        }
    ];

    const handleToolCall = async (name: string, args: any) => {
        console.log("Tool executing:", name, args);

        if (name === 'create_listing') {
            // Standardize crop name to English for search
            const standardizedName = await translateText(args.cropName, 'english');

            const newListing: Omit<CropListing, 'id'> = {
                farmerId: user.id,
                farmerName: user.name,
                cropName: args.cropName,
                cropNameEnglish: standardizedName,
                quantity: args.quantity,
                price: args.price,
                location: args.location || user.location || 'India',
                description: 'Created via Voice Assistant',
                timestamp: Date.now()
            };
            onAddListing(newListing);
            return "Listing created successfully.";
        }

        if (name === 'delete_listing') {
            // Find closest match by name
            const target = listingsRef.current.find(l =>
                l.farmerId === user.id &&
                l.cropName.toLowerCase().includes(args.cropName.toLowerCase())
            );
            if (target) {
                onDeleteListing(target.id);
                return `Deleted ${target.cropName} listing.`;
            }
            return `Could not find a listing for ${args.cropName}.`;
        }

        if (name === 'update_listing') {
            const target = listingsRef.current.find(l =>
                l.farmerId === user.id &&
                l.cropName.toLowerCase().includes(args.cropName.toLowerCase())
            );
            if (target) {
                const updated = { ...target };
                if (args.newPrice) updated.price = args.newPrice;
                if (args.newQuantity) updated.quantity = args.newQuantity;
                onUpdateListing(updated);
                return `Updated ${target.cropName}. New price: ${updated.price}, Quantity: ${updated.quantity}`;
            }
            return `Could not find ${args.cropName} to update.`;
        }

        if (name === 'get_my_listings') {
            const myCurrentListings = listingsRef.current.filter(l => l.farmerId === user.id);
            if (myCurrentListings.length === 0) return "You have no listings yet.";
            return JSON.stringify(myCurrentListings.map(l => ({ name: l.cropName, qty: l.quantity, price: l.price })));
        }

        if (name === 'check_inbox') {
            const incoming = messagesRef.current.filter(m => m.senderId !== user.id);
            if (incoming.length === 0) return "No new messages.";
            // Simple heuristic: group by sender (assuming only 1 mock buyer 'buyer_1' for now)
            return "You have new messages in your inbox. Please check the 'Inbox' tab.";
        }

        if (name === 'read_latest_messages') {
            const incoming = messagesRef.current.filter(m => m.senderId !== user.id).slice(-3); // Get last 3
            if (incoming.length === 0) return "No incoming messages.";
            return JSON.stringify(incoming.map(m => ({ from: m.senderId, text: m.text })));
        }

        if (name === 'send_reply') {
            // Heuristic: reply to last sender
            const lastIncoming = messagesRef.current.slice().reverse().find(m => m.senderId !== user.id);
            const receiverId = lastIncoming ? lastIncoming.senderId : 'buyer_1';

            try {
                await api.sendMessage({
                    senderId: user.id,
                    receiverId,
                    text: args.message,
                    timestamp: Date.now()
                });
                // We rely on polling to show it in the list, or optionallyoptimistically add it
                return "Message sent to Manoj.";
            } catch (e) {
                return "Failed to send message.";
            }
        }

        return "Unknown tool";
    };

    // --- Actions ---

    const startCreate = () => {
        setFormState({});
        setEditingId(null);
        setInsight(null);
        setView('create');
    };

    const startEdit = (listing: CropListing) => {
        setFormState(listing);
        setEditingId(listing.id);
        setView('edit');
    };

    const saveListing = async () => {
        if (editingId) {
            onUpdateListing({ ...formState, id: editingId } as CropListing);
        } else {
            // Standardize crop name
            const standardizedName = await translateText(formState.cropName || '', 'english');

            onAddListing({
                ...formState,
                farmerId: user.id,
                farmerName: user.name,
                cropNameEnglish: standardizedName,
                timestamp: Date.now(),
                description: formState.description || 'Fresh crop'
            } as Omit<CropListing, 'id'>);
        }
        setView('home');
    };

    const openChat = (partnerId: string) => {
        setActivePartnerId(partnerId);
        setView('chat');
    };

    const sendMessage = async () => {
        if (!newMessage.trim()) return;

        const receiverId = activePartnerId || 'buyer_1';

        try {
            const msg = await api.sendMessage({
                senderId: user.id,
                receiverId: receiverId,
                text: newMessage,
                timestamp: Date.now()
            });

            setMessages(prev => [...prev, msg]);
            setNewMessage('');
        } catch (error) {
            console.error("Failed to send", error);
        }
    };

    // --- Render Views ---

    if (view === 'create' || view === 'edit') {
        const isEdit = view === 'edit';
        const instruction = `You are assisting a farmer in ${isEdit ? 'updating' : 'creating'} a listing. Help them fill quantity, price.`;

        return (
            <div className="min-h-screen bg-gray-50 p-4 pb-24">
                <button onClick={() => setView('home')} className="mb-4 flex items-center text-gray-600">
                    <ArrowLeft className="w-5 h-5 mr-1" /> Back
                </button>

                <h2 className="text-2xl font-bold mb-6 text-gray-800">{isEdit ? t('edit') : t('createListing')}</h2>

                {insight && (
                    <div className="mb-6 bg-orange-50 border border-orange-200 p-4 rounded-xl">
                        <div className="flex items-center gap-2 text-orange-800 font-bold mb-1">
                            <TrendingUp className="w-4 h-4" /> {t('marketInsight')}
                        </div>
                        <p className="text-3xl font-bold text-gray-800">₹{insight.recommendedPrice}</p>
                        <p className="text-sm text-gray-600">{insight.advice}</p>
                    </div>
                )}

                <div className="bg-white p-6 rounded-xl shadow-sm space-y-4">
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">{t('cropName')}</label>
                        <input
                            type="text"
                            value={formState.cropName || ''}
                            onChange={e => setFormState({ ...formState, cropName: e.target.value })}
                            className="w-full p-3 border rounded-lg bg-gray-50 text-lg font-medium"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">{t('quantity')}</label>
                            <input
                                type="number"
                                value={formState.quantity || ''}
                                onChange={e => setFormState({ ...formState, quantity: parseInt(e.target.value) })}
                                className="w-full p-3 border rounded-lg bg-gray-50 text-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">{t('price')}</label>
                            <input
                                type="number"
                                value={formState.price || ''}
                                onChange={e => setFormState({ ...formState, price: parseInt(e.target.value) })}
                                className="w-full p-3 border rounded-lg bg-gray-50 text-lg"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">{t('location')}</label>
                        <input
                            type="text"
                            value={formState.location || ''}
                            onChange={e => setFormState({ ...formState, location: e.target.value })}
                            className="w-full p-3 border rounded-lg bg-gray-50"
                        />
                    </div>

                    <button onClick={saveListing} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg shadow-lg mt-4">
                        {isEdit ? t('update') : t('save')}
                    </button>
                </div>

                <LiveAssistant
                    systemInstruction={instruction}
                    initialMessage={t('tapToSpeak')}
                />
            </div>
        );
    }

    if (view === 'profile') {
        const saveProfile = () => {
            onUpdateUser({ name: profileData.name });
            setView('home');
        };

        return (
            <div className="min-h-screen bg-gray-50 p-4">
                <button onClick={() => setView('home')} className="mb-4 flex items-center text-gray-600">
                    <ArrowLeft className="w-5 h-5 mr-1" /> Back
                </button>
                <h2 className="text-2xl font-bold mb-6 text-gray-800">{t('profile') || 'Profile'}</h2>

                <div className="bg-white p-6 rounded-xl shadow-sm space-y-4">
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">Name</label>
                        <input
                            type="text"
                            value={profileData.name}
                            onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                            className="w-full p-3 border rounded-lg bg-gray-50 text-lg font-medium"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">Phone (Cannot Change)</label>
                        <div className="w-full p-3 border rounded-lg bg-gray-100 text-gray-500">
                            {user.phone}
                        </div>
                    </div>
                    <button onClick={saveProfile} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg shadow-lg mt-4">
                        Save Profile
                    </button>
                </div>
            </div>
        );
    }

    if (view === 'chat') {
        const partnerName = inboxItems.find(i => i.partnerId === activePartnerId)?.name || 'User';
        const chatMessages = messages.filter(m =>
            (m.senderId === user.id && m.receiverId === activePartnerId) ||
            (m.senderId === activePartnerId && m.receiverId === user.id)
        );

        return (
            <div className="flex flex-col h-screen bg-gray-50">
                <div className="bg-white p-4 shadow-sm flex items-center justify-between z-10">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setView('home')}><ArrowLeft className="w-6 h-6 text-gray-600" /></button>
                        <span className="font-bold text-lg">{partnerName}</span>
                    </div>
                    <a href={`tel:+910000000000`} className="bg-green-100 p-2 rounded-full text-green-700">
                        <Phone className="w-5 h-5" />
                    </a>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
                    {chatMessages.length === 0 ? (
                        <div className="text-center text-gray-400 mt-10">No messages yet. Say Namaste!</div>
                    ) : (
                        chatMessages.map(m => (
                            <div key={m.id} className={`flex ${m.senderId === user.id ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-3 rounded-xl ${m.senderId === user.id ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-800'}`}>
                                    {m.text}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="bg-white p-4 border-t flex gap-2 fixed bottom-0 w-full md:max-w-md">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={t('typeMessage')}
                        className="flex-1 border rounded-full px-4 py-2 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    />
                    <button onClick={sendMessage} className="bg-emerald-600 text-white p-2 rounded-full px-6">{t('send')}</button>
                </div>

                <LiveAssistant
                    systemInstruction="Help the farmer reply."
                    tools={tools}
                    onToolCall={handleToolCall}
                />
            </div>
        )
    }

    // --- Home View ---

    const systemInstruction = `
    You are an intelligent agricultural assistant for ${user.name}.
    You can help manage their inventory and communications.
    - To add a crop, ask for details and call create_listing.
    - To remove a crop, call delete_listing.
    - To change price/quantity, call update_listing.
    - To summarize inventory, call get_my_listings.
    - To check for orders/messages, call check_inbox.
    - To read messages, call read_latest_messages.
    - To reply to a buyer, call send_reply with the message content.
    Speak simply in ${user.language} or English mixed.
  `;

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            <header className="bg-emerald-700 text-white p-6 rounded-b-3xl shadow-lg mb-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">{t('welcome')}, {user.name}</h1>
                        <p className="opacity-90">{t('roleFarmer')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => { setProfileData({ name: user.name }); setView('profile'); }} className="bg-white/20 p-2 rounded-full hover:bg-white/30">
                            <UserIcon className="w-6 h-6" />
                        </button>
                        <div className="bg-white/20 p-2 rounded-full">
                            <Sprout className="w-6 h-6" />
                        </div>
                        <button
                            onClick={onLogout}
                            className="bg-red-500/20 p-2 rounded-full hover:bg-red-500/40 transition-colors"
                            aria-label="Logout"
                        >
                            <LogOut className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex bg-emerald-800/50 p-1 rounded-xl">
                    <button
                        onClick={() => setActiveTab('my_listings')}
                        className={`flex-1 py-2 rounded-lg font-medium transition-all ${activeTab === 'my_listings' ? 'bg-white text-emerald-800 shadow' : 'text-emerald-100'}`}
                    >
                        {t('myListings')}
                    </button>
                    <button
                        onClick={() => setActiveTab('inbox')}
                        className={`flex-1 py-2 rounded-lg font-medium transition-all ${activeTab === 'inbox' ? 'bg-white text-emerald-800 shadow' : 'text-emerald-100'}`}
                    >
                        {t('inbox')}
                    </button>
                </div>
            </header>

            <div className="p-4">
                {activeTab === 'my_listings' ? (
                    <div className="space-y-4">
                        {myListings.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">{t('noListings')}</div>
                        ) : (
                            myListings.map(listing => (
                                <div key={listing.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative group">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-lg font-bold text-gray-800">{listing.cropName}</h3>
                                        <div className="flex gap-2">
                                            <button onClick={() => startEdit(listing)} className="text-emerald-600 p-2 bg-emerald-50 rounded-full">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => onDeleteListing(listing.id)} className="text-red-600 p-2 bg-red-50 rounded-full">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 text-sm text-gray-600 mb-2">
                                        <span>{listing.quantity} kg</span>
                                        <span>•</span>
                                        <span>₹{listing.price}/kg</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mb-2">{listing.location}</p>
                                </div>
                            ))
                        )}

                        {/* Floating Add Button */}
                        <button
                            onClick={startCreate}
                            className="fixed bottom-24 right-6 bg-emerald-600 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center hover:bg-emerald-700 z-40"
                        >
                            <Plus className="w-8 h-8" />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {inboxItems.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <p>{t('noListings').replace('Listings', 'Messages') || "No messages"}</p>
                            </div>
                        ) : (
                            inboxItems.map(item => (
                                <div key={item.partnerId} onClick={() => openChat(item.partnerId)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:bg-gray-50">
                                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold uppercase">
                                        {item.name.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-gray-800">{item.name}</h4>
                                        <p className="text-sm text-gray-500 truncate">{item.lastMsg}</p>
                                    </div>
                                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            <LiveAssistant
                systemInstruction={systemInstruction}
                initialMessage={t('tapToSpeak')}
                tools={tools}
                onToolCall={handleToolCall}
            />
        </div>
    );
};

export default FarmerDashboard;