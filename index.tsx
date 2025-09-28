

import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat, HarmCategory, HarmBlockThreshold, Type } from '@google/genai';

const API_KEY = process.env.API_KEY;

// Fix: Add types for SpeechRecognition and webkitSpeechRecognition to the global Window interface to resolve TypeScript errors.
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// Define a type for property objects to ensure type safety.
interface Property {
    id: number;
    address: string;
    rent: number;
    imageUrl: string;
    score: number;
    summary: string;
    link: string;
    contact: {
        name: string;
        phone: string;
    };
    rating: number;
    reviewCount: number;
    reviewQuote: string;
    amenities: {
        pets: boolean;
        dogs: boolean;
        laundry: boolean;
        garage: boolean;
    };
}

// FIX: Moved StarRating component outside of App component and added types for props.
const StarRating = ({ rating, count }: { rating: number; count: number }) => {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 !== 0;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
    return (
        <div className="star-rating">
            {[...Array(fullStars)].map((_, i) => <span key={`full-${i}`} className="material-icons">star</span>)}
            {halfStar && <span className="material-icons">star_half</span>}
            {[...Array(emptyStars)].map((_, i) => <span key={`empty-${i}`} className="material-icons">star_border</span>)}
            <span className="review-count">({count})</span>
        </div>
    );
};

// FIX: Moved AmenityIcons component outside of App component and added types for props.
const AmenityIcons = ({ amenities }: { amenities: Property['amenities'] }) => (
    <div className="amenity-icons">
        <div className={`amenity-icon ${amenities.pets ? 'active' : ''}`} title="Pet Friendly">
            <span className="material-icons">pets</span>
        </div>
        <div className={`amenity-icon ${amenities.dogs ? 'active' : ''}`} title="Dog Friendly">
            <span className="material-icons">pets</span>
        </div>
        <div className={`amenity-icon ${amenities.laundry ? 'active' : ''}`} title="Washer/Dryer">
            <span className="material-icons">local_laundry_service</span>
        </div>
        <div className={`amenity-icon ${amenities.garage ? 'active' : ''}`} title="Garage">
            <span className="material-icons">garage</span>
        </div>
    </div>
);

// FIX: Moved PropertyListItem component outside of App to resolve TypeScript errors with the 'key' prop.
const PropertyListItem = ({ prop, isSaved, onToggleSave, onDraftEmail }: { prop: Property; isSaved: boolean; onToggleSave: (prop: Property) => void; onDraftEmail: (prop: Property) => Promise<void>; }) => (
    <div className="property-list-item">
        <div className="property-image">
            <img src={prop.imageUrl} alt={`Image of ${prop.address}`} />
        </div>
        <div className="property-info">
            <div className="property-info-header">
                 <h3><a href={prop.link} target="_blank" rel="noopener noreferrer">{prop.address}</a></h3>
                 <span className="price">${prop.rent}/mo</span>
            </div>
            {prop.rating > 0 && <StarRating rating={prop.rating} count={prop.reviewCount} />}
            {prop.reviewQuote && <p className="review-quote">"{prop.reviewQuote}"</p>}
            <p className="ai-summary">{prop.summary}</p>
            
             <div className="property-footer">
                <div className="contact-info">
                    <strong>{prop.contact?.name}</strong>
                    <span>{prop.contact?.phone}</span>
                </div>
                <AmenityIcons amenities={prop.amenities} />
                <div className="property-actions">
                    <button className="btn" onClick={() => onDraftEmail(prop)}>Draft Email</button>
                    <button className={`btn-icon save-btn ${isSaved ? 'saved' : ''}`} onClick={() => onToggleSave(prop)} title={isSaved ? 'Unsave Property' : 'Save Property'}>
                        <span className="material-icons">
                            {isSaved ? 'favorite' : 'favorite_border'}
                        </span>
                    </button>
                </div>
            </div>
        </div>
        <div className="deal-score">
            <div className="deal-score-value">{prop.score}</div>
            <div className="deal-score-label">AI Score</div>
        </div>
    </div>
);

const App = () => {
    // App State
    const [theme, setTheme] = useState('theme-cyberpunk-teal');
    const [isRunning, setIsRunning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [properties, setProperties] = useState<Property[]>([]);
    const [savedProperties, setSavedProperties] = useState<Property[]>(() => {
        try {
            const saved = localStorage.getItem('aiHouseHunterSaved');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to parse saved properties from localStorage", e);
            return [];
        }
    });
    const [error, setError] = useState(null);
    const [emailDraft, setEmailDraft] = useState({
        isOpen: false,
        isLoading: false,
        content: '',
        error: null,
        property: null,
    });

    // Filter State
    const [destination, setDestination] = useState('Eden Prairie, MN');
    const [radius, setRadius] = useState('10');
    const [propertyType, setPropertyType] = useState('any');
    const [bedrooms, setBedrooms] = useState('any');
    const [bathrooms, setBathrooms] = useState('any');
    const [maxRent, setMaxRent] = useState('3000');
    const [aiPrompt, setAiPrompt] = useState(
        'Looking for a 2-3 bedroom rental. We have a past eviction due to an illegal eviction situation, so we need landlords who are understanding or private listings (like on Craigslist) that might not do strict credit checks. Focus on finding places with good value, low crime rates, and access to public parks. Mention the eviction situation when looking for workarounds.'
    );

    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatHistory, setChatHistory] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const chatRef = useRef<Chat | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);


    useEffect(() => {
        document.body.className = theme;
    }, [theme]);

     useEffect(() => {
        localStorage.setItem('aiHouseHunterSaved', JSON.stringify(savedProperties));
    }, [savedProperties]);
    
    useEffect(() => {
        if(isChatOpen && !chatRef.current) {
            try {
                const ai = new GoogleGenAI({ apiKey: API_KEY });
                const newChat = ai.chats.create({
                    model: 'gemini-2.5-flash',
                    config: {
                         safetySettings: [
                            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        ],
                        systemInstruction: "You are a helpful AI assistant for a house hunter. You can analyze documents, answer questions about real estate, and help the user in their search for a new rental home."
                    }
                });
                chatRef.current = newChat;
                 if(chatHistory.length === 0) {
                     setChatHistory([{ role: 'model', parts: [{ text: "Hello! How can I assist you with your rental search today? You can ask me questions or upload a document for review." }] }]);
                }
            } catch (e) {
                console.error("Failed to initialize chat:", e);
                setError("Failed to initialize the AI assistant. Please check your API key.");
            }
        }
    }, [isChatOpen]);


    const handleStartAgent = async () => {
        setIsRunning(true);
        setLoading(true);
        setError(null);

        let structuredQuery = `Find rental properties. `;
        structuredQuery += `The property should be within a ${radius} mile radius of ${destination}. `;
        if (propertyType !== 'any') structuredQuery += `The property type should be a ${propertyType}. `;
        if (bedrooms !== 'any') structuredQuery += `It should have at least ${bedrooms} bedroom(s). `;
        if (bathrooms !== 'any') structuredQuery += `It should have at least ${bathrooms} bathroom(s). `;
        structuredQuery += `The maximum rent should be around $${maxRent} per month. `;
        
        const fullPrompt = `${structuredQuery}. Now, consider these more detailed requirements and nuances: ${aiPrompt}. Please respond with only a valid JSON array of property objects. Do not include any other text or markdown formatting.`;

        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: fullPrompt,
                config: {
                    tools: [{ googleSearch: {} }],
                }
            });

            let responseText = response.text.trim();
            if (responseText.startsWith('```json')) {
                responseText = responseText.substring(7);
            }
            if (responseText.endsWith('```')) {
                responseText = responseText.substring(0, responseText.length - 3);
            }
            responseText = responseText.trim();
            
            try {
                const parsedProperties = JSON.parse(responseText);

                if (Array.isArray(parsedProperties)) {
                     setProperties(prev => {
                        const existingIds = new Set(prev.map(p => p.id));
                        const newProperties = parsedProperties.filter(p => p.id && !existingIds.has(p.id));
                        return [...prev, ...newProperties];
                    });
                } else {
                    console.error("Parsed response is not an array:", parsedProperties);
                    setError("The AI returned data in an unexpected format. Please try again.");
                }

            } catch (parseError) {
                console.error("Failed to parse AI response:", parseError);
                console.error("Raw AI response:", responseText);
                setError("The AI returned an invalid response. Try adjusting your prompt or criteria.");
            }

        } catch (e) {
            console.error(e);
            setError("The AI agent encountered an error. Please try again.");
        } finally {
            setLoading(false);
            // Re-run agent if still active
            if (isRunning) {
                setTimeout(handleStartAgent, 5000); // Recursive call to continue searching
            }
        }
    };

    const handleStopAgent = () => {
        setIsRunning(false);
    };
    
    const handleSaveCriteria = () => {
        const criteria = {
            destination,
            radius,
            propertyType,
            bedrooms,
            bathrooms,
            maxRent,
            aiPrompt
        };
        localStorage.setItem('aiHouseHunterCriteria', JSON.stringify(criteria));
        alert('Search criteria saved!');
    };
    
    const handleLoadCriteria = () => {
        const savedCriteriaJSON = localStorage.getItem('aiHouseHunterCriteria');
        if (savedCriteriaJSON) {
            const savedCriteria = JSON.parse(savedCriteriaJSON);
            setDestination(savedCriteria.destination);
            setRadius(savedCriteria.radius);
            setPropertyType(savedCriteria.propertyType);
            setBedrooms(savedCriteria.bedrooms);
            setBathrooms(savedCriteria.bathrooms);
            setMaxRent(savedCriteria.maxRent);
            setAiPrompt(savedCriteria.aiPrompt);
            alert('Search criteria loaded!');
        } else {
            alert('No saved criteria found.');
        }
    };

    const handleToggleSaveProperty = (propertyToToggle: Property) => {
        setSavedProperties(prevSaved => {
            const isSaved = prevSaved.some(p => p.id === propertyToToggle.id);
            if (isSaved) {
                return prevSaved.filter(p => p.id !== propertyToToggle.id);
            } else {
                return [...prevSaved, propertyToToggle];
            }
        });
    };

    const handleSendMessage = async (messageContent, file = null) => {
        if ((!messageContent || messageContent.trim() === '') && !file) return;
    
        const userMessageParts: { text: string }[] = [];
        
        if (file) {
            userMessageParts.push({ text: `Here is a document named "${file.name}":\n\n${file.content}` });
            if (messageContent) {
                userMessageParts.push({ text: messageContent });
            }
        } else if (messageContent) {
            userMessageParts.push({ text: messageContent });
        } else {
            return;
        }
    
        const userMessageForHistory = { role: 'user', parts: userMessageParts };
    
        setChatHistory(prev => [...prev, userMessageForHistory]);
        setChatInput('');
        setChatLoading(true);
    
        try {
            if (!chatRef.current) throw new Error("Chat not initialized");
            // FIX: The sendMessage method expects an object with a 'message' property, which holds the array of parts.
            const response = await chatRef.current.sendMessage({ message: userMessageParts });
            const modelResponse = { role: 'model', parts: [{ text: response.text }] };
            setChatHistory(prev => [...prev, modelResponse]);
        } catch (e) {
            console.error(e);
            const errorResponse = { role: 'model', parts: [{ text: "Sorry, I encountered an error. Please try again." }] };
            setChatHistory(prev => [...prev, errorResponse]);
        } finally {
            setChatLoading(false);
        }
    };
    
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result as string;
                const prompt = `Please summarize or analyze this document: ${file.name}`;
                handleSendMessage(prompt, {name: file.name, content});
            };
            reader.readAsText(file);
             // Reset file input to allow uploading the same file again
            event.target.value = null;
        }
    };

    const handleFileUploadClick = () => {
        fileInputRef.current?.click();
    };
    
    const startVoiceRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setChatInput(transcript);
                handleSendMessage(transcript);
            };
            recognition.start();
        } else {
            alert("Sorry, your browser does not support voice recognition.");
        }
    };

    const handleDraftEmail = async (property: Property) => {
        setEmailDraft({ isOpen: true, isLoading: true, content: '', error: null, property: property });

        const draftPrompt = `
            Draft a professional and friendly email to inquire about the rental property at ${property.address}.
            The contact person is ${property.contact?.name || 'the leasing office'}.
            My maximum rent is around $${maxRent}.
            
            Please incorporate the following personal details and preferences from my notes, but phrase them tactfully and positively: "${aiPrompt}".
            
            The email should:
            1. Express strong interest in the property.
            2. Briefly introduce myself/us.
            3. Ask about availability and the application process.
            4. Inquire about scheduling a viewing.
            
            Keep the tone polite and professional.
        `;

        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: draftPrompt,
            });

            setEmailDraft(prev => ({ ...prev, isLoading: false, content: response.text }));
        } catch (e) {
            console.error("Failed to draft email:", e);
            setEmailDraft(prev => ({ ...prev, isLoading: false, error: 'Failed to generate email draft. Please try again.' }));
        }
    };

    const handleCloseEmailModal = () => {
        setEmailDraft({ isOpen: false, isLoading: false, content: '', error: null, property: null });
    };
    
    const EmailDraftModal = ({ draft, onClose }) => {
        if (!draft.isOpen) return null;

        const handleCopyToClipboard = () => {
            navigator.clipboard.writeText(draft.content).then(() => {
                alert('Email draft copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        };

        return (
            <div className="modal-overlay">
                <div className="modal-content">
                    <div className="modal-header">
                        <h2>Draft Email for {draft.property.address}</h2>
                        <button onClick={onClose} className="close-btn">&times;</button>
                    </div>
                    <div className="modal-body">
                        {draft.isLoading && <div className="loader"></div>}
                        {draft.error && <div className="status-message">{draft.error}</div>}
                        {!draft.isLoading && !draft.error && (
                            <textarea readOnly value={draft.content}></textarea>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button className="btn" onClick={handleCopyToClipboard} disabled={draft.isLoading || !!draft.error}>
                            Copy to Clipboard
                        </button>
                        <button className="btn" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="container">
            <header className="header">
                <h1>AI House Hunter</h1>
                <div className="theme-switcher">
                    <button onClick={() => setTheme('theme-cyberpunk-teal')} className={theme === 'theme-cyberpunk-teal' ? 'active' : ''}>Cyberpunk</button>
                    <button onClick={() => setTheme('theme-icy-blue')} className={theme === 'theme-icy-blue' ? 'active' : ''}>Icy Blue</button>
                </div>
            </header>

            <section className="control-panel">
                <h2>Search Parameters</h2>
                <div className="filters">
                    <div className="form-group">
                        <label htmlFor="destination">Destination</label>
                        <input type="text" id="destination" value={destination} onChange={e => setDestination(e.target.value)} />
                    </div>
                     <div className="form-group">
                        <label htmlFor="radius">Search Radius (miles)</label>
                        <input type="number" id="radius" value={radius} onChange={e => setRadius(e.target.value)} />
                    </div>
                     <div className="form-group">
                        <label htmlFor="propertyType">Property Type</label>
                        <select id="propertyType" value={propertyType} onChange={e => setPropertyType(e.target.value)}>
                            <option value="any">Any</option>
                            <option value="apartment">Apartment</option>
                            <option value="house">House</option>
                            <option value="townhouse">Townhouse</option>
                        </select>
                    </div>
                     <div className="form-group">
                        <label htmlFor="bedrooms">Bedrooms</label>
                        <select id="bedrooms" value={bedrooms} onChange={e => setBedrooms(e.target.value)}>
                            <option value="any">Any</option>
                            <option value="1">1+</option>
                            <option value="2">2+</option>
                            <option value="3">3+</option>
                            <option value="4">4+</option>
                        </select>
                    </div>
                     <div className="form-group">
                        <label htmlFor="bathrooms">Bathrooms</label>
                        <select id="bathrooms" value={bathrooms} onChange={e => setBathrooms(e.target.value)}>
                             <option value="any">Any</option>
                            <option value="1">1+</option>
                            <option value="2">2+</option>
                            <option value="3">3+</option>
                        </select>
                    </div>
                     <div className="form-group">
                        <label htmlFor="maxRent">Max Rent ($)</label>
                        <input type="number" id="maxRent" value={maxRent} onChange={e => setMaxRent(e.target.value)} />
                    </div>
                </div>
                <div className="form-group">
                     <label htmlFor="aiPrompt">Detailed AI Prompt</label>
                     <textarea id="aiPrompt" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}></textarea>
                </div>
                <div className="agent-controls">
                    {!isRunning ? (
                        <button className="btn" onClick={handleStartAgent}>Start Agent</button>
                    ) : (
                        <button className="btn stop-btn" onClick={handleStopAgent}>Stop Agent</button>
                    )}
                    <button className="btn" onClick={handleSaveCriteria}>Save Criteria</button>
                    <button className="btn" onClick={handleLoadCriteria}>Load Criteria</button>
                </div>
            </section>

            <main className="main-content">
                 {savedProperties.length > 0 && (
                    <section className="properties-section">
                        <h2>Saved Properties</h2>
                        <div className="properties-list">
                            {savedProperties.map(prop => (
                                <PropertyListItem 
                                    key={`saved-${prop.id}`} 
                                    prop={prop} 
                                    isSaved={true} 
                                    onToggleSave={handleToggleSaveProperty} 
                                    onDraftEmail={handleDraftEmail}
                                />
                            ))}
                        </div>
                    </section>
                )}

                <section className="properties-section">
                    <h2>Search Results</h2>
                    <div className="properties-list">
                        
                        {!loading && !error && properties.length === 0 && (
                            <div className="status-message">
                                {isRunning ? 'Agent is running...' : 'AI Agent is idle. Start the agent to find properties.'}
                            </div>
                        )}
                        {properties.map(prop => (
                           <PropertyListItem 
                                key={prop.id} 
                                prop={prop} 
                                isSaved={savedProperties.some(p => p.id === prop.id)} 
                                onToggleSave={handleToggleSaveProperty} 
                                onDraftEmail={handleDraftEmail}
                            />
                        ))}
                         {loading && <div className="status-message"><div className="loader"></div>Searching for properties...</div>}
                        {error && <div className="status-message">{error}</div>}
                    </div>
                </section>
            </main>
            
             <button className="chat-toggle" onClick={() => setIsChatOpen(!isChatOpen)}>
                <span className="material-icons">{isChatOpen ? 'close' : 'hub'}</span>
            </button>

            <div className={`chat-assistant ${isChatOpen ? 'open' : ''}`}>
                <div className="chat-header">
                    <h3>AI Assistant</h3>
                </div>
                <div className="chat-history">
                    {chatHistory.map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.role}`}>
                            {msg.parts.map((part, partIndex) => (
                                <div key={partIndex} style={{whiteSpace: 'pre-wrap'}}>{part.text}</div>
                            ))}
                        </div>
                    ))}
                    {chatLoading && (
                        <div className="chat-message model loading">
                            <span className="dot"></span>
                            <span className="dot"></span>
                            <span className="dot"></span>
                        </div>
                    )}
                </div>
                <div className="chat-input-area">
                    <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !chatLoading && handleSendMessage(chatInput)}
                        placeholder="Ask me anything..."
                        disabled={chatLoading}
                    />
                    <button onClick={() => !chatLoading && handleSendMessage(chatInput)} title="Send Message" disabled={chatLoading}>
                        <span className="material-icons">send</span>
                    </button>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} disabled={chatLoading} />
                    <button onClick={handleFileUploadClick} title="Upload File" disabled={chatLoading}>
                         <span className="material-icons">attach_file</span>
                    </button>
                    <button onClick={startVoiceRecognition} title="Voice Input" disabled={chatLoading}>
                        <span className="material-icons">mic</span>
                    </button>
                </div>
            </div>

            <EmailDraftModal draft={emailDraft} onClose={handleCloseEmailModal} />
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);