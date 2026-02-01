import React, { useState, useEffect, useRef } from 'react';
import { User, CropListing, Message } from '../types';
import { api } from '../api';
import { translateText } from '../services/geminiService';
import { TRANSLATIONS } from '../constants';
import LiveAssistant from '../components/LiveAssistant';
import { MapPin, MessageCircle, ArrowLeft, LogOut, Search, X, User as UserIcon } from 'lucide-react';
import { FunctionDeclaration, Type } from '@google/genai';

interface Props {
    user: User;
    listings: CropListing[];
    onLogout: () => void;
    onUpdateUser: (updates: Partial<User>) => void;
}

const BuyerDashboard: React.FC<Props> = ({ user, listings, onLogout, onUpdateUser }) => {
    const [selectedListing, setSelectedListing] = useState<CropListing | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    // State for advanced filters
    const [activeFilters, setActiveFilters] = useState({
        query: '',
        location: '',
        farmerName: '',
        minPrice: 0,
        maxPrice: Infinity,
        timeFilter: 'all' as 'all' | 'newest' | 'today' | 'week'
    });

    const [showProfile, setShowProfile] = useState(false);
    const [profileData, setProfileData] = useState({ name: '' });
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

    // Refs for Voice Assistant Context
    const listingsRef = useRef(listings);
    const selectedListingRef = useRef(selectedListing);
    const messagesRef = useRef(messages);

    useEffect(() => {
        listingsRef.current = listings;
    }, [listings]);

    useEffect(() => {
        selectedListingRef.current = selectedListing;
    }, [selectedListing]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const t = (key: keyof typeof TRANSLATIONS['en']) => {
        return TRANSLATIONS[user.language][key] || TRANSLATIONS['en'][key];
    };

    // --- Voice Tools Configuration ---
    const tools: FunctionDeclaration[] = [
        {
            name: "search_market",
            description: "Search and filter the marketplace. Use this for ANY search query. You can filter by crop name, location, farmer, price range, and time (recency).",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    query: { type: Type.STRING, description: "Crop name in English (e.g. Onion, Wheat)" },
                    location: { type: Type.STRING, description: "Filter by location (e.g. Nashik)" },
                    farmerName: { type: Type.STRING, description: "Filter by farmer name" },
                    minPrice: { type: Type.NUMBER, description: "Minimum price" },
                    maxPrice: { type: Type.NUMBER, description: "Maximum price" },
                    time: { type: Type.STRING, enum: ["newest", "today", "week", "all"], description: "Time filter: 'newest' (sorted), 'today' (last 24h), 'week' (last 7 days), 'all'." }
                },
                required: []
            }
        },
        {
            name: "clear_search",
            description: "Clear all filters and show all crops.",
            parameters: { type: Type.OBJECT, properties: {} }
        },
        {
            name: "contact_seller",
            description: "Start negotiating with a farmer. Use this ONLY when the user explicitly wants to MESSAGE or TALK to a specific seller.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    farmerName: { type: Type.STRING, description: "Name of the farmer (exact match from list preferred)" },
                    cropName: { type: Type.STRING, description: "Crop name to further identify the seller" },
                    location: { type: Type.STRING, description: "Location of the seller" },
                    price: { type: Type.NUMBER, description: "Price of the crop" }
                },
                required: []
            }
        },
        {
            name: "sort_market",
            description: "Sort the marketplace listings.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    sortBy: { type: Type.STRING, enum: ["price_asc", "price_desc"], description: "Sort order" }
                },
                required: ["sortBy"]
            }
        },
        {
            name: "send_message",
            description: "Send a message to the current seller while in a negotiation chat.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    message: { type: Type.STRING, description: "The message content" }
                },
                required: ["message"]
            }
        },
        {
            name: "read_messages",
            description: "Read the latest messages in the current chat.",
            parameters: { type: Type.OBJECT, properties: {} }
        },
        {
            name: "go_back",
            description: "Exit the chat and go back to the marketplace feed.",
            parameters: { type: Type.OBJECT, properties: {} }
        }
    ];

    const handleToolCall = async (name: string, args: any) => {
        console.log("Buyer Tool:", name, args);

        if (name === "search_market") {
            setActiveFilters({
                query: args.query || '',
                location: args.location || '',
                farmerName: args.farmerName || '',
                minPrice: args.minPrice || 0,
                maxPrice: args.maxPrice || Infinity,
                timeFilter: args.time || 'all'
            });

            if (args.time === 'newest') setSortOrder(null); // time sorting handled in filter logic usually or just rely on default? Default is usually newest first.

            let response = "Filtered market";
            if (args.query) response += ` for ${args.query}`;
            if (args.location) response += ` in ${args.location}`;
            if (args.time) response += ` time: ${args.time}`;
            return response;
        }

        if (name === "clear_search") {
            setActiveFilters({
                query: '',
                location: '',
                farmerName: '',
                minPrice: 0,
                maxPrice: Infinity,
                timeFilter: 'all'
            });
            return "Showing all listings.";
        }

        if (name === "contact_seller") {
            let candidates = listingsRef.current;

            // Apply Filters
            if (args.farmerName) {
                // First try strict/partial match
                const nameQuery = args.farmerName.toLowerCase();
                let matches = candidates.filter(l => l.farmerName.toLowerCase().includes(nameQuery));

                // If no name match, check if the assistant passed a "Localized Name" but our DB has English?
                // Or if the user meant a specific person from the VISIBLE list which might account for transcripts.
                if (matches.length === 0) {
                    // Fallback: If the user said a name that seems like a first name
                    // and we have it in our cache/list?
                    // For now, rely on "Partial" match.
                } else {
                    candidates = matches;
                }
            }
            if (args.cropName) {
                const q = args.cropName.toLowerCase();
                candidates = candidates.filter(l =>
                    l.cropName.toLowerCase().includes(q) ||
                    l.cropNameEnglish?.toLowerCase().includes(q)
                );
            }
            if (args.location) {
                candidates = candidates.filter(l => l.location.toLowerCase().includes(args.location.toLowerCase()));
            }
            if (args.price) {
                candidates = candidates.filter(l => l.price === Number(args.price));
            }

            // AUTO-SELECT Logic for "Message him/that seller" context where assistant passes no name
            // If the filter resulted in exactly 1 candidate (or very few), assume that's the intent.
            // But we need to be careful. If no args provided, candidates = ALL listings.
            const hasArgs = args.farmerName || args.cropName || args.location || args.price;

            // If explicit name failed, return appropriate error.
            if (args.farmerName && candidates.length === 0) {
                return `I couldn't find a farmer named '${args.farmerName}'. Please try the name from the list.`;
            }

            if (candidates.length === 0) return "No matching sellers found to contact.";

            // Sort by price (Best Price First)
            candidates.sort((a, b) => a.price - b.price);
            const best = candidates[0];

            // If a specific name provided -> Open Chat directly
            if (args.farmerName && candidates.length > 0) {
                setSelectedListing(candidates[0]);
                return `Opened chat with ${candidates[0].farmerName}.`;
            }

            // If we have a SINGLE result from a specific query (e.g. "Message the Onion seller in Nashik")
            if (hasArgs && candidates.length === 1) {
                setSelectedListing(candidates[0]);
                return `Opened chat with ${candidates[0].farmerName}.`;
            }

            // Safety Check: If Name is NOT provided, require confirmation by showing list instead of messaging.
            if (!args.farmerName) {
                // Update UI to show these results
                if (args.location) setActiveFilters(prev => ({ ...prev, location: args.location }));
                else if (args.cropName) setActiveFilters(prev => ({ ...prev, query: args.cropName }));

                setSortOrder('asc'); // Show Best Price first
                return `Found ${candidates.length} sellers. The best price is ₹${best.price} from ${best.farmerName}. Who would you like to contact?`;
            }

            // Fallback
            const target = best;
            setSelectedListing(target);
            return `Opened chat with ${target.farmerName} for ${target.cropName} at ₹${target.price}.`;
        }

        if (name === "sort_market") {
            if (args.sortBy === 'price_asc') {
                setSortOrder('asc');
                return "Sorted by best price (lowest first).";
            }
            if (args.sortBy === 'price_desc') {
                setSortOrder('desc');
                return "Sorted by price (highest first).";
            }
            setSortOrder(null);
            return "Sort cleared.";
        }

        if (name === "go_back") {
            setSelectedListing(null);
            return "Returned to marketplace.";
        }

        if (name === "send_message") {
            if (!selectedListingRef.current) return "You are not in a chat. Select a seller first.";

            const text = args.message;
            try {
                const msg = await api.sendMessage({
                    senderId: user.id,
                    receiverId: selectedListingRef.current.farmerId,
                    listingId: selectedListingRef.current.id,
                    text: text,
                    timestamp: Date.now()
                });
                setMessages(prev => [...prev, msg]);
                return "Message sent.";
            } catch (e) {
                console.error("Voice msg failed", e);
                return "Failed to send message.";
            }
        }

        if (name === "read_messages") {
            if (!selectedListingRef.current) return "Open a chat first.";
            const msgs = messagesRef.current;
            if (msgs.length === 0) return "No messages yet.";

            // Read last 3
            const lastMsgs = msgs.slice(-3).map(m =>
                `${m.senderId === user.id ? 'You' : 'Farmer'}: ${m.text}`
            ).join('. ');
            return lastMsgs;
        }

        return "Unknown tool";
    };

    // --- Logic ---
    // Fetch messages when chat opens
    useEffect(() => {
        let interval: any;
        if (selectedListing) {
            const fetchMsgs = async () => {
                // Get messages between me and the farmer
                const msgs = await api.getMessages(user.id, selectedListing.farmerId);
                setMessages(msgs);
            };
            fetchMsgs();
            interval = setInterval(fetchMsgs, 3000);
        }
        return () => clearInterval(interval);
    }, [selectedListing, user.id]);

    // --- Logic ---
    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedListing) return;

        try {
            const msg = await api.sendMessage({
                senderId: user.id,
                receiverId: selectedListing.farmerId,
                listingId: selectedListing.id,
                text: newMessage,
                timestamp: Date.now()
            });

            setMessages(prev => [...prev, msg]);
            setNewMessage('');

            // Removed Simulated Farmer Response - now relies on real user reply
        } catch (e) {
            console.error("Msg failed", e);
        }
    };

    const filteredListings = listings.filter(l => {
        // Query Filter
        if (activeFilters.query) {
            const q = activeFilters.query.toLowerCase();
            const match = l.cropName.toLowerCase().includes(q) ||
                l.cropNameEnglish?.toLowerCase().includes(q);
            if (!match) return false;
        }

        // Location Filter
        if (activeFilters.location) {
            if (!l.location.toLowerCase().includes(activeFilters.location.toLowerCase())) return false;
        }

        // Farmer Name Filter
        if (activeFilters.farmerName) {
            if (!l.farmerName.toLowerCase().includes(activeFilters.farmerName.toLowerCase())) return false;
        }

        // Price Filter
        if (l.price < activeFilters.minPrice) return false;
        if (l.price > activeFilters.maxPrice) return false;

        // Time Filter
        if (activeFilters.timeFilter === 'today') {
            const oneDay = 24 * 60 * 60 * 1000;
            if (Date.now() - l.timestamp > oneDay) return false;
        }
        if (activeFilters.timeFilter === 'week') {
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - l.timestamp > oneWeek) return false;
        }

        return true;
    }).sort((a, b) => {
        if (sortOrder === 'asc') return a.price - b.price;
        if (sortOrder === 'desc') return b.price - a.price;
        // Default sort by Recency if 'newest'
        if (activeFilters.timeFilter === 'newest') return b.timestamp - a.timestamp;

        return 0;
    });

    // View: Profile
    if (showProfile) {
        const saveProfile = () => {
            onUpdateUser({ name: profileData.name });
            setShowProfile(false);
        };

        return (
            <div className="min-h-screen bg-gray-50 p-4">
                <button onClick={() => setShowProfile(false)} className="mb-4 flex items-center text-gray-600">
                    <ArrowLeft className="w-5 h-5 mr-1" /> Back
                </button>
                <h2 className="text-2xl font-bold mb-6 text-gray-800">Profile</h2>

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

    // View: Negotiation Chat
    if (selectedListing) {
        const negotiationInstruction = `
        You are a translator and negotiation assistant for a buyer speaking ${user.language}.
        The topic is ${selectedListing.cropName}.
        Use 'send_message' to send replies to the farmer.
        Use 'go_back' to return to list.
        Use 'read_messages' to read history.
    `;

        return (
            <div className="flex flex-col h-screen bg-gray-50">
                {/* Chat Header */}
                <div className="bg-white p-4 shadow-sm flex items-center gap-3 z-10">
                    <button onClick={() => setSelectedListing(null)} className="p-2 hover:bg-gray-100 rounded-full">
                        <ArrowLeft className="w-6 h-6 text-gray-600" />
                    </button>
                    <div>
                        <h2 className="font-bold text-gray-800">{selectedListing.farmerName}</h2>
                        <p className="text-xs text-gray-500">{t('negotiationTitle')}: {selectedListing.cropName}</p>
                    </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
                    <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-sm mb-4">
                        <p className="font-semibold text-emerald-800">{selectedListing.quantity}kg @ ₹{selectedListing.price}/kg</p>
                    </div>

                    {messages.map((m) => {
                        const isMe = m.senderId === user.id;
                        return (
                            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-3 rounded-xl ${isMe ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'}`}>
                                    <p>{m.text}</p>
                                    {m.translatedText && (
                                        <p className="mt-2 pt-2 border-t border-gray-200/50 text-sm opacity-90 italic">
                                            {m.translatedText}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Input Area */}
                <div className="bg-white p-4 border-t flex gap-2 fixed bottom-0 w-full md:max-w-md left-0 md:left-auto">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={t('typeMessage')}
                        className="flex-1 border rounded-full px-4 py-2 focus:ring-2 focus:ring-emerald-500 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button onClick={handleSendMessage} className="bg-emerald-600 text-white p-2 rounded-full px-6 font-semibold">
                        {t('send')}
                    </button>
                </div>

                <LiveAssistant
                    systemInstruction={negotiationInstruction}
                    initialMessage={t('tapToSpeak')}
                    tools={tools}
                    onToolCall={handleToolCall}
                />
            </div>
        );
    }

    // View: Marketplace Feed
    const feedInstruction = `
    You are a buyer assistant for ${user.name} speaking ${user.language}.
    
    Current Visible Listings (Reference Context):
    ${filteredListings.slice(0, 5).map((l, i) => `${i + 1}. [${l.farmerName}] selling ${l.cropName} for ₹${l.price}`).join('\n    ')}

    Universal Commands:
    - Use 'search_market' to find crops. ALWAYS convert search to English.
    - Use 'contact_seller' to talk to a farmer. 
      - IMPORTANT: If the user says "Message HIM", "Message THAT seller", or refers to a person by name from the Visible Listings above, pass the EXACT farmer name from the list.
      - If multiple sellers are visible but the user specifies a name, try to match the visible name.
    - Use 'sort_market' to filter/sort for best price.
  `;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <header className="bg-white p-6 sticky top-0 z-10 shadow-sm flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{t('mandiTitle')}</h1>
                        <p className="text-gray-500">{t('findCrops')}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setProfileData({ name: user.name }); setShowProfile(true); }}
                            className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                            aria-label="Profile"
                        >
                            <UserIcon className="w-5 h-5 text-gray-600" />
                        </button>
                        <button
                            onClick={onLogout}
                            className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                            aria-label="Logout"
                        >
                            <LogOut className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        value={activeFilters.query}
                        onChange={(e) => setActiveFilters(prev => ({ ...prev, query: e.target.value }))}
                        placeholder="Search crops, farmers or location..."
                        className="w-full pl-10 pr-10 py-2.5 bg-gray-100 border-none rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    {activeFilters.query && (
                        <button onClick={() => setActiveFilters(prev => ({ ...prev, query: '' }))} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </header>

            <div className="p-4 grid gap-4">
                {filteredListings.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        No crops found matching your criteria.
                    </div>
                ) : (
                    filteredListings.map(listing => (
                        <div key={listing.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 transition-all hover:shadow-md">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">{listing.cropName}</h3>
                                    <p className="text-sm text-gray-500 flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> {listing.location}
                                    </p>
                                </div>
                                <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-md">
                                    {listing.farmerName}
                                </span>
                            </div>

                            <p className="text-gray-600 text-sm mb-4 line-clamp-2">{listing.description}</p>

                            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                <div>
                                    <span className="text-xs text-gray-500 uppercase">{t('price')}</span>
                                    <p className="font-bold text-xl text-emerald-700">₹{listing.price}<span className="text-sm font-normal text-gray-500">/kg</span></p>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 uppercase">{t('quantity')}</span>
                                    <p className="font-bold text-gray-800">{listing.quantity} kg</p>
                                </div>
                            </div>

                            <button
                                onClick={() => setSelectedListing(listing)}
                                className="w-full mt-4 bg-gray-900 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-gray-800"
                            >
                                <MessageCircle className="w-4 h-4" />
                                {t('negotiate')}
                            </button>
                        </div>
                    ))
                )}
            </div>

            <LiveAssistant
                systemInstruction={feedInstruction}
                initialMessage={t('tapToSpeak')}
                tools={tools}
                onToolCall={handleToolCall}
            />
        </div>
    );
};

export default BuyerDashboard;