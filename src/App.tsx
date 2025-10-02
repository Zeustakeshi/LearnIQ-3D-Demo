import { GoogleGenerativeAI } from "@google/generative-ai";
import {
    Environment,
    OrbitControls,
    useAnimations,
    useGLTF,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const genAI = new GoogleGenerativeAI("AIzaSyCDq24GPA9uYhcyeTpXszOZD8pWv5Pjlcg");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Utility functions for animation management
const cleanAnimationName = (name: string): string => {
    // Remove the long prefix and return just the action name
    return name.split("|").pop() || name;
};

const categorizeAnimations = (names: string[]) => {
    const categories: { [key: string]: string[] } = {
        "Basic Actions": [],
        Movement: [],
        Combat: [],
        Work: [],
        Emotions: [],
        Sitting: [],
    };

    names.forEach((name) => {
        const cleanName = cleanAnimationName(name);

        if (
            cleanName.includes("Idle") ||
            cleanName.includes("Wave") ||
            cleanName.includes("Yes") ||
            cleanName.includes("No")
        ) {
            categories["Basic Actions"].push(name);
        } else if (
            cleanName.includes("Walk") ||
            cleanName.includes("Run") ||
            cleanName.includes("Jump") ||
            cleanName.includes("Duck")
        ) {
            categories["Movement"].push(name);
        } else if (
            cleanName.includes("Punch") ||
            cleanName.includes("Sword") ||
            cleanName.includes("HitReact") ||
            cleanName.includes("Death")
        ) {
            categories["Combat"].push(name);
        } else if (
            cleanName.includes("Assembly") ||
            cleanName.includes("Chop") ||
            cleanName.includes("Pan")
        ) {
            categories["Work"].push(name);
        } else if (cleanName.includes("Sitting")) {
            categories["Sitting"].push(name);
        } else {
            categories["Basic Actions"].push(name);
        }
    });

    // Remove empty categories
    Object.keys(categories).forEach((key) => {
        if (categories[key].length === 0) {
            delete categories[key];
        }
    });

    return categories;
};

const suggestAnimationFromText = (
    text: string,
    availableAnimations: string[]
): string[] => {
    const lowerText = text.toLowerCase();
    const foundAnimations: string[] = [];

    // Enhanced keyword matching with sequence support
    const keywords: { [key: string]: string[] } = {
        walk: ["Walk"],
        run: ["Run"],
        chạy: ["Run"],
        jump: ["Jump"],
        nhảy: ["Jump"],
        sit: ["Sitting"],
        ngồi: ["Sitting"],
        wave: ["Wave"],
        vẫy: ["Wave"],
        chào: ["Wave"],
        yes: ["Yes"],
        no: ["No"],
        punch: ["Punch"],
        đấm: ["Punch"],
        sword: ["Sword"],
        chop: ["Chop"],
        cook: ["Pan"],
        work: ["Assembly"],
        idle: ["Idle"],
        duck: ["Duck"],
        death: ["Death"],
        eat: ["Eating"],
    };

    // Check for sequence indicators
    const sequenceWords = ["then", "rồi", "sau đó", "tiếp theo", "và", "and"];
    const hasSequence = sequenceWords.some((word) => lowerText.includes(word));

    if (hasSequence) {
        // Try to find multiple animations in sequence
        for (const [keyword, animationParts] of Object.entries(keywords)) {
            if (lowerText.includes(keyword)) {
                for (const part of animationParts) {
                    const match = availableAnimations.find((anim) =>
                        cleanAnimationName(anim).includes(part)
                    );
                    if (match && !foundAnimations.includes(match)) {
                        foundAnimations.push(match);
                    }
                }
            }
        }
    } else {
        // Single animation search
        for (const [keyword, animationParts] of Object.entries(keywords)) {
            if (lowerText.includes(keyword)) {
                for (const part of animationParts) {
                    const match = availableAnimations.find((anim) =>
                        cleanAnimationName(anim).includes(part)
                    );
                    if (match) return [match];
                }
            }
        }
    }

    return foundAnimations;
};

function PandaModel({
    currentAction,
    onActionsLoaded,
    onAnimationFinished,
    isPlayingQueue,
}: {
    currentAction: string;
    onActionsLoaded: (actions: string[]) => void;
    onAnimationFinished: () => void;
    isPlayingQueue: boolean;
}) {
    const group = useRef<THREE.Group>(null!);
    const { scene, animations } = useGLTF("/panda.glb");
    const { actions, names } = useAnimations(animations, group);

    useEffect(() => {
        // Log available animations for debugging
        console.log("Available animations:", names);

        // Pass available actions to parent component
        if (names.length > 0) {
            onActionsLoaded(names);
        }

        // Stop all actions first
        Object.values(actions).forEach((action) => {
            action?.stop();
        });

        // Play the selected action
        if (currentAction && actions[currentAction]) {
            const action = actions[currentAction];
            action?.reset();

            // If we're playing a queue, set animation to play once
            // Otherwise, let it loop normally
            if (isPlayingQueue) {
                action?.setLoop(2200, 1); // THREE.LoopOnce = 2200, play once
                if (action) {
                    action.clampWhenFinished = true;
                }
            } else {
                action?.setLoop(2201, Infinity); // THREE.LoopRepeat = 2201, loop forever
            }

            action?.play();

            // Set up animation finished callback only for queue mode
            if (isPlayingQueue) {
                const duration = action?.getClip().duration || 2; // fallback to 2 seconds
                console.log(
                    `Animation "${currentAction}" duration: ${duration}s`
                );

                const timeoutId = setTimeout(() => {
                    console.log(
                        `Animation "${currentAction}" finished, calling onAnimationFinished`
                    );
                    onAnimationFinished();
                }, duration * 1000); // Convert to milliseconds

                // Clean up timeout
                return () => {
                    clearTimeout(timeoutId);
                };
            }
        }
    }, [
        currentAction,
        actions,
        names,
        onActionsLoaded,
        onAnimationFinished,
        isPlayingQueue,
    ]);

    return (
        <group ref={group}>
            <primitive object={scene} scale={1} position={[0, 0, 0]} />
        </group>
    );
}

function App() {
    const [currentAction, setCurrentAction] = useState<string>("");
    const [availableActions, setAvailableActions] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [selectedCategory, setSelectedCategory] = useState<string>("All");
    const [userCommand, setUserCommand] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // Animation Queue System
    const [animationQueue, setAnimationQueue] = useState<string[]>([]);
    const [isPlayingQueue, setIsPlayingQueue] = useState<boolean>(false);
    const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(0);

    // Chat System
    const [chatMessages, setChatMessages] = useState<
        { id: number; type: "user" | "ai"; message: string; timestamp: Date }[]
    >([
        {
            id: 1,
            type: "ai",
            message:
                "Xin chào! Tôi là trợ lý ảo của khách sạn. Tôi có thể giúp gì cho quý khách hôm nay?",
            timestamp: new Date(),
        },
    ]);
    const [chatInput, setChatInput] = useState<string>("");

    // Auto-return-to-idle system
    const [autoReturnToIdle, setAutoReturnToIdle] = useState<boolean>(true);
    const [idleDelay, setIdleDelay] = useState<number>(3); // seconds
    const [idleTimeoutId, setIdleTimeoutId] = useState<number | null>(null);

    const handleActionsLoaded = (actions: string[]) => {
        setAvailableActions(actions);
    };

    // Function to find idle animation
    const findIdleAnimation = (): string | null => {
        const idleAnimation = availableActions.find((anim) =>
            cleanAnimationName(anim).toLowerCase().includes("idle")
        );
        return idleAnimation || null;
    };

    // Function to start idle timer
    const startIdleTimer = () => {
        if (!autoReturnToIdle) return;

        // Clear existing timer
        if (idleTimeoutId) {
            clearTimeout(idleTimeoutId);
        }

        const idleAnimation = findIdleAnimation();
        if (!idleAnimation) return;

        console.log(`Starting idle timer: ${idleDelay} seconds`);

        const timeoutId = setTimeout(() => {
            console.log(
                `Returning to idle: ${cleanAnimationName(idleAnimation)}`
            );
            setCurrentAction(idleAnimation);
            setIsPlayingQueue(false);
            setIdleTimeoutId(null);
        }, idleDelay * 1000);

        setIdleTimeoutId(timeoutId as unknown as number);
    };

    // Function to clear idle timer
    const clearIdleTimer = () => {
        if (idleTimeoutId) {
            clearTimeout(idleTimeoutId);
            setIdleTimeoutId(null);
        }
    };

    // Animation Queue Management
    const playAnimationQueue = (queue: string[]) => {
        if (queue.length === 0) return;

        console.log(`Starting animation queue:`, queue.map(cleanAnimationName));
        clearIdleTimer(); // Clear any existing idle timer
        setAnimationQueue(queue);
        setIsPlayingQueue(true);
        setCurrentQueueIndex(0);
        setCurrentAction(queue[0]);
    };
    const stopAnimationQueue = () => {
        clearIdleTimer(); // Clear any existing idle timer
        setAnimationQueue([]);
        setIsPlayingQueue(false);
        setCurrentQueueIndex(0);
        setCurrentAction("");
    };

    // This will be called when an animation finishes (we'll add this logic to PandaModel)
    const onAnimationFinished = () => {
        console.log(
            `Animation finished. Queue status: playing=${isPlayingQueue}, currentIndex=${currentQueueIndex}, queueLength=${animationQueue.length}`
        );

        if (isPlayingQueue && currentQueueIndex < animationQueue.length - 1) {
            const nextIndex = currentQueueIndex + 1;
            console.log(
                `Moving to next animation: ${animationQueue[nextIndex]} (index ${nextIndex})`
            );
            setCurrentQueueIndex(nextIndex);
            setCurrentAction(animationQueue[nextIndex]);
        } else if (isPlayingQueue) {
            // Queue finished
            console.log("Queue finished! Starting idle timer...");
            setIsPlayingQueue(false);
            setCurrentQueueIndex(0);
            startIdleTimer(); // Start timer to return to idle
        } else {
            // Single animation finished
            console.log("Single animation finished! Starting idle timer...");
            startIdleTimer(); // Start timer to return to idle
        }
    };

    const categories =
        availableActions.length > 0
            ? categorizeAnimations(availableActions)
            : {};
    const categoryNames = ["All", ...Object.keys(categories)];

    const filteredActions = availableActions.filter((action) => {
        const cleanName = cleanAnimationName(action);
        const matchesSearch = cleanName
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
        const matchesCategory =
            selectedCategory === "All" ||
            (categories[selectedCategory] &&
                categories[selectedCategory].includes(action));
        return matchesSearch && matchesCategory;
    });

    const handleLLMCommand = async () => {
        if (!userCommand.trim() || isLoading) return;

        setIsLoading(true);
        try {
            // First, try simple keyword matching
            const suggestedAnimations = suggestAnimationFromText(
                userCommand,
                availableActions
            );

            if (suggestedAnimations.length > 0) {
                clearIdleTimer(); // Clear any existing idle timer
                if (suggestedAnimations.length === 1) {
                    setCurrentAction(suggestedAnimations[0]);
                    setIsPlayingQueue(false);
                } else {
                    playAnimationQueue(suggestedAnimations);
                }
                setUserCommand("");
                setIsLoading(false);
                return;
            }

            // If no simple match, use AI for more sophisticated analysis
            const availableAnimationsList = availableActions
                .map(cleanAnimationName)
                .join(", ");

            const result = await model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [{ text: userCommand }],
                    },
                ],
                systemInstruction: {
                    text: `
You are an AI assistant that maps user commands to 3D character animations.

Available animations: ${availableAnimationsList}

Your task:
1. Analyze the user's input command
2. If the command contains sequence words like "then", "rồi", "sau đó", "và", "and", return multiple animations separated by commas
3. Otherwise, select the most appropriate single animation
4. Return animation names separated by commas, or "none" if no suitable match

Examples:
- "make the panda wave" → "Wave"
- "let the character run then jump" → "Run,Jump"
- "chạy rồi nhảy" → "Run,Jump"
- "panda wave and then sit down" → "Wave,Sitting_Start"
- "show me a fighting move" → "Punch"
- "dance" → "none" (if no dance animation available)

User command: "${userCommand}"
Return animation names (comma-separated for sequences):
                    `,
                },
            });

            const response = result.response;
            const suggestedByAI = await response.text();
            const cleanSuggestion = suggestedByAI.trim().replace(/["`]/g, "");

            if (cleanSuggestion.toLowerCase() !== "none") {
                const animationNames = cleanSuggestion
                    .split(",")
                    .map((name) => name.trim());
                const exactMatches: string[] = [];

                for (const animName of animationNames) {
                    const exactMatch = availableActions.find(
                        (anim) =>
                            cleanAnimationName(anim).toLowerCase() ===
                                animName.toLowerCase() ||
                            cleanAnimationName(anim).includes(animName)
                    );
                    if (exactMatch) {
                        exactMatches.push(exactMatch);
                    }
                }

                if (exactMatches.length > 0) {
                    clearIdleTimer(); // Clear any existing idle timer
                    if (exactMatches.length === 1) {
                        setCurrentAction(exactMatches[0]);
                        setIsPlayingQueue(false);
                    } else {
                        playAnimationQueue(exactMatches);
                    }
                    console.log(
                        `AI suggested: "${cleanSuggestion}" -> Found: ${exactMatches.join(
                            ", "
                        )}`
                    );
                } else {
                    console.log(
                        `AI suggested: "${cleanSuggestion}" -> No matches found`
                    );
                }
            } else {
                console.log(
                    `AI suggested: "${cleanSuggestion}" -> No match found`
                );
            }

            setUserCommand("");
        } catch (error) {
            console.error("Error processing command:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // New function for AI Receptionist Chat
    const handleReceptionistChat = async () => {
        if (!chatInput.trim() || isLoading) return;

        const userMessage = chatInput.trim();

        // Add user message to chat
        const userChatMessage = {
            id: Date.now(),
            type: "user" as const,
            message: userMessage,
            timestamp: new Date(),
        };

        setChatMessages((prev) => [...prev, userChatMessage]);
        setChatInput("");
        setIsLoading(true);

        try {
            const availableAnimationsList = availableActions
                .map(cleanAnimationName)
                .join(", ");

            const result = await model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [{ text: userMessage }],
                    },
                ],
                systemInstruction: {
                    text: `
You are a virtual hotel receptionist controlling a 3D panda avatar. You should respond professionally and helpfully to customer inquiries.

Available avatar actions: ${availableAnimationsList}

Your task:
1. Analyze the customer's input and respond as a professional hotel receptionist
2. Select appropriate actions for the avatar based on the context
3. Return response in JSON format with this structure:
{
  "message": "Your professional response in Vietnamese",
  "actions": ["action1", "action2", ...] // Can be empty array if no actions needed
}

Action selection guidelines:
- Wave: For greetings, saying goodbye
- Yes/No: For agreeing/disagreeing
- Idle: For neutral conversation
- Sitting: When discussing sitting areas, waiting
- Run/Walk: When giving directions
- Punch/Sword: NEVER use for customer service
- Duck: For apologizing, showing embarrassment

Examples:
Customer: "Xin chào, tôi muốn check-in"
Response: {
  "message": "Xin chào quý khách! Chào mừng đến với khách sạn. Tôi sẽ hỗ trợ quý khách check-in ngay. Xin quý khách vui lòng cung cấp giấy tờ tùy thân.",
  "actions": ["Wave", "Yes"]
}

Customer: "Phòng tắm ở đâu?"
Response: {
  "message": "Phòng tắm nằm ở cuối hành lang bên trái, quý khách đi thẳng rồi rẽ trái sẽ thấy ngay ạ.",
  "actions": ["Walk"]
}

Customer: "Tôi không hài lòng với dịch vụ"
Response: {
  "message": "Tôi rất xin lỗi vì sự bất tiện này. Chúng tôi sẽ cải thiện và bù đắp cho quý khách. Xin cho tôi biết cụ thể vấn đề để tôi hỗ trợ tốt hơn.",
  "actions": ["Duck"]
}

Now respond to: "${userMessage}"
                    `,
                },
            });

            const response = result.response;
            const aiResponseText = await response.text();

            // Parse JSON response
            const cleanResponse = aiResponseText
                .trim()
                .replace(/```json\s*/, "")
                .replace(/\s*```$/, "");
            const parsedResponse = JSON.parse(cleanResponse);

            // Add AI message to chat
            const aiChatMessage = {
                id: Date.now() + 1,
                type: "ai" as const,
                message: parsedResponse.message,
                timestamp: new Date(),
            };

            setChatMessages((prev) => [...prev, aiChatMessage]);

            // Execute actions if any
            if (parsedResponse.actions && parsedResponse.actions.length > 0) {
                const actionMatches: string[] = [];

                for (const actionName of parsedResponse.actions) {
                    const exactMatch = availableActions.find(
                        (anim) =>
                            cleanAnimationName(anim).toLowerCase() ===
                                actionName.toLowerCase() ||
                            cleanAnimationName(anim).includes(actionName)
                    );
                    if (exactMatch) {
                        actionMatches.push(exactMatch);
                    }
                }

                if (actionMatches.length > 0) {
                    clearIdleTimer(); // Clear any existing idle timer
                    if (actionMatches.length === 1) {
                        setCurrentAction(actionMatches[0]);
                        setIsPlayingQueue(false);
                    } else {
                        playAnimationQueue(actionMatches);
                    }
                }
            }
        } catch (error) {
            console.error("Error in receptionist chat:", error);

            // Add error message
            const errorMessage = {
                id: Date.now() + 2,
                type: "ai" as const,
                message:
                    "Xin lỗi, tôi gặp sự cố kỹ thuật. Vui lòng thử lại sau.",
                timestamp: new Date(),
            };

            setChatMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <style>
                {`
                    @keyframes pulse {
                        0%, 100% { opacity: 0.4; }
                        50% { opacity: 1; }
                    }
                `}
            </style>
            <div
                style={{
                    width: "100vw",
                    height: "100vh",
                    position: "relative",
                }}
            >
                <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
                    <ambientLight intensity={0.5} />
                    <directionalLight position={[10, 10, 5]} intensity={1} />
                    <PandaModel
                        currentAction={currentAction}
                        onActionsLoaded={handleActionsLoaded}
                        onAnimationFinished={onAnimationFinished}
                        isPlayingQueue={isPlayingQueue}
                    />
                    <OrbitControls enableDamping dampingFactor={0.25} />
                    <Environment preset="sunset" />
                </Canvas>

                {/* AI Receptionist Chat Interface */}
                <div
                    style={{
                        position: "absolute",
                        top: "20px",
                        right: "20px",
                        background: "rgba(0, 0, 0, 0.9)",
                        padding: "20px",
                        borderRadius: "12px",
                        color: "white",
                        fontFamily: "Arial, sans-serif",
                        width: "400px",
                        height: "500px",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <h3
                        style={{
                            margin: "0 0 15px 0",
                            fontSize: "16px",
                            textAlign: "center",
                            borderBottom: "1px solid #555",
                            paddingBottom: "10px",
                        }}
                    >
                        🐼 AI Receptionist Chat
                    </h3>

                    {/* Chat Messages */}
                    <div
                        style={{
                            flex: 1,
                            overflowY: "auto",
                            marginBottom: "15px",
                            paddingRight: "5px",
                        }}
                    >
                        {chatMessages.map((msg) => (
                            <div
                                key={msg.id}
                                style={{
                                    marginBottom: "12px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems:
                                        msg.type === "user"
                                            ? "flex-end"
                                            : "flex-start",
                                }}
                            >
                                <div
                                    style={{
                                        maxWidth: "80%",
                                        padding: "10px 15px",
                                        borderRadius: "18px",
                                        fontSize: "13px",
                                        lineHeight: "1.4",
                                        background:
                                            msg.type === "user"
                                                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                                                : "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                                        color: "white",
                                        wordWrap: "break-word",
                                    }}
                                >
                                    {msg.message}
                                </div>
                                <div
                                    style={{
                                        fontSize: "10px",
                                        color: "#888",
                                        marginTop: "4px",
                                        padding: "0 5px",
                                    }}
                                >
                                    {msg.type === "user" ? "Bạn" : "Lễ tân"} •{" "}
                                    {msg.timestamp.toLocaleTimeString("vi-VN", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "flex-start",
                                    marginBottom: "12px",
                                }}
                            >
                                <div
                                    style={{
                                        padding: "10px 15px",
                                        borderRadius: "18px",
                                        background: "#333",
                                        fontSize: "13px",
                                        color: "#ccc",
                                    }}
                                >
                                    <span>Lễ tân đang soạn câu trả lời</span>
                                    <span
                                        style={{
                                            animation: "pulse 1.5s infinite",
                                            marginLeft: "5px",
                                        }}
                                    >
                                        ...
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Chat Input */}
                    <div style={{ display: "flex", gap: "10px" }}>
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Hỏi lễ tân bất kỳ điều gì..."
                            onKeyPress={(e) =>
                                e.key === "Enter" && handleReceptionistChat()
                            }
                            disabled={isLoading}
                            style={{
                                flex: 1,
                                padding: "12px 15px",
                                borderRadius: "25px",
                                border: "1px solid #555",
                                background: "#222",
                                color: "white",
                                fontSize: "13px",
                                outline: "none",
                            }}
                        />
                        <button
                            onClick={handleReceptionistChat}
                            disabled={isLoading || !chatInput.trim()}
                            style={{
                                padding: "12px 20px",
                                borderRadius: "25px",
                                border: "none",
                                background:
                                    isLoading || !chatInput.trim()
                                        ? "#444"
                                        : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                color: "white",
                                cursor:
                                    isLoading || !chatInput.trim()
                                        ? "not-allowed"
                                        : "pointer",
                                fontSize: "13px",
                                fontWeight: "bold",
                                transition: "all 0.3s ease",
                            }}
                        >
                            {isLoading ? "⏳" : "📤"}
                        </button>
                    </div>
                </div>

                {/* Enhanced Animation Controls UI */}
                <div
                    style={{
                        position: "absolute",
                        top: "20px",
                        left: "20px",
                        background: "rgba(0, 0, 0, 0.85)",
                        padding: "20px",
                        borderRadius: "12px",
                        color: "white",
                        fontFamily: "Arial, sans-serif",
                        width: "320px",
                        maxHeight: "80vh",
                        overflowY: "auto",
                    }}
                >
                    <h3
                        style={{
                            margin: "0 0 15px 0",
                            fontSize: "16px",
                            textAlign: "center",
                        }}
                    >
                        🎭 Animation Controls
                    </h3>

                    {/* LLM Command Input */}
                    <div style={{ marginBottom: "15px" }}>
                        <label
                            style={{
                                fontSize: "12px",
                                marginBottom: "5px",
                                display: "block",
                            }}
                        >
                            AI Command:
                        </label>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <input
                                type="text"
                                value={userCommand}
                                onChange={(e) => setUserCommand(e.target.value)}
                                placeholder="e.g., 'make panda wave' or 'panda should run'"
                                onKeyPress={(e) =>
                                    e.key === "Enter" && handleLLMCommand()
                                }
                                style={{
                                    flex: 1,
                                    padding: "8px",
                                    borderRadius: "4px",
                                    border: "1px solid #555",
                                    background: "#333",
                                    color: "white",
                                    fontSize: "11px",
                                }}
                            />
                            <button
                                onClick={handleLLMCommand}
                                disabled={isLoading}
                                style={{
                                    padding: "8px 12px",
                                    background: isLoading ? "#666" : "#2196F3",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: isLoading
                                        ? "not-allowed"
                                        : "pointer",
                                    fontSize: "11px",
                                }}
                            >
                                {isLoading ? "..." : "▶"}
                            </button>
                        </div>
                    </div>

                    {availableActions.length > 0 ? (
                        <>
                            {/* Auto-Return-to-Idle Controls */}
                            <div
                                style={{
                                    marginBottom: "15px",
                                    fontSize: "11px",
                                    padding: "10px",
                                    background: "rgba(255, 193, 7, 0.2)",
                                    borderRadius: "6px",
                                    border: "1px solid #FFC107",
                                }}
                            >
                                <div
                                    style={{
                                        marginBottom: "8px",
                                        fontWeight: "bold",
                                    }}
                                >
                                    ⏰ Auto Return to Idle
                                </div>

                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        marginBottom: "8px",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        id="autoIdleToggle"
                                        checked={autoReturnToIdle}
                                        onChange={(e) => {
                                            setAutoReturnToIdle(
                                                e.target.checked
                                            );
                                            if (!e.target.checked) {
                                                clearIdleTimer();
                                            }
                                        }}
                                        style={{ marginRight: "8px" }}
                                    />
                                    <label
                                        htmlFor="autoIdleToggle"
                                        style={{ fontSize: "11px" }}
                                    >
                                        Enable auto-return to idle
                                    </label>
                                </div>

                                {autoReturnToIdle && (
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: "10px",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            After:
                                        </span>
                                        <input
                                            type="range"
                                            min="1"
                                            max="10"
                                            value={idleDelay}
                                            onChange={(e) =>
                                                setIdleDelay(
                                                    Number(e.target.value)
                                                )
                                            }
                                            style={{ flex: 1 }}
                                        />
                                        <span
                                            style={{
                                                fontSize: "10px",
                                                minWidth: "35px",
                                            }}
                                        >
                                            {idleDelay}s
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Current Action Display */}
                            <div
                                style={{
                                    marginBottom: "15px",
                                    fontSize: "12px",
                                    padding: "8px",
                                    background: "rgba(76, 175, 80, 0.2)",
                                    borderRadius: "4px",
                                    border: "1px solid #4CAF50",
                                }}
                            >
                                <strong>Current:</strong>{" "}
                                {currentAction
                                    ? cleanAnimationName(currentAction)
                                    : "None"}
                            </div>

                            {/* Animation Queue Display */}
                            {isPlayingQueue && animationQueue.length > 0 && (
                                <div
                                    style={{
                                        marginBottom: "15px",
                                        fontSize: "11px",
                                        padding: "8px",
                                        background: "rgba(33, 150, 243, 0.2)",
                                        borderRadius: "4px",
                                        border: "1px solid #2196F3",
                                    }}
                                >
                                    <div style={{ marginBottom: "5px" }}>
                                        <strong>
                                            🎬 Queue ({currentQueueIndex + 1}/
                                            {animationQueue.length}):
                                        </strong>
                                    </div>
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: "4px",
                                        }}
                                    >
                                        {animationQueue.map((anim, index) => (
                                            <span
                                                key={index}
                                                style={{
                                                    padding: "2px 6px",
                                                    background:
                                                        index ===
                                                        currentQueueIndex
                                                            ? "#4CAF50"
                                                            : "#555",
                                                    borderRadius: "3px",
                                                    fontSize: "10px",
                                                    color: "white",
                                                }}
                                            >
                                                {cleanAnimationName(anim)}
                                            </span>
                                        ))}
                                    </div>
                                    <button
                                        onClick={stopAnimationQueue}
                                        style={{
                                            marginTop: "8px",
                                            padding: "4px 8px",
                                            background: "#f44336",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "3px",
                                            cursor: "pointer",
                                            fontSize: "10px",
                                            width: "100%",
                                        }}
                                    >
                                        ⏹️ Stop Queue
                                    </button>
                                </div>
                            )}

                            {/* Search */}
                            <div style={{ marginBottom: "10px" }}>
                                <input
                                    type="text"
                                    placeholder="Search animations..."
                                    value={searchTerm}
                                    onChange={(e) =>
                                        setSearchTerm(e.target.value)
                                    }
                                    style={{
                                        width: "100%",
                                        padding: "8px",
                                        borderRadius: "4px",
                                        border: "1px solid #555",
                                        background: "#333",
                                        color: "white",
                                        fontSize: "11px",
                                    }}
                                />
                            </div>

                            {/* Category Filter */}
                            <div style={{ marginBottom: "15px" }}>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) =>
                                        setSelectedCategory(e.target.value)
                                    }
                                    style={{
                                        width: "100%",
                                        padding: "8px",
                                        borderRadius: "4px",
                                        border: "1px solid #555",
                                        background: "#333",
                                        color: "white",
                                        fontSize: "11px",
                                    }}
                                >
                                    {categoryNames.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Action Buttons */}
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "5px",
                                }}
                            >
                                <button
                                    onClick={() => {
                                        clearIdleTimer();
                                        setCurrentAction("");
                                        stopAnimationQueue();
                                    }}
                                    style={{
                                        padding: "10px 12px",
                                        background:
                                            currentAction === "" &&
                                            !isPlayingQueue
                                                ? "#4CAF50"
                                                : "#d32f2f",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "6px",
                                        cursor: "pointer",
                                        fontSize: "12px",
                                        fontWeight: "bold",
                                    }}
                                >
                                    ⏹️ Stop All
                                </button>

                                {filteredActions.slice(0, 15).map((action) => (
                                    <button
                                        key={action}
                                        onClick={() => {
                                            clearIdleTimer();
                                            setCurrentAction(action);
                                            setIsPlayingQueue(false);
                                        }}
                                        style={{
                                            padding: "8px 12px",
                                            background:
                                                currentAction === action
                                                    ? "#4CAF50"
                                                    : "#555",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "4px",
                                            cursor: "pointer",
                                            fontSize: "11px",
                                            textAlign: "left",
                                            transition: "all 0.2s",
                                        }}
                                    >
                                        {cleanAnimationName(action)}
                                    </button>
                                ))}

                                {filteredActions.length > 15 && (
                                    <div
                                        style={{
                                            fontSize: "10px",
                                            color: "#ccc",
                                            textAlign: "center",
                                            padding: "5px",
                                        }}
                                    >
                                        +{filteredActions.length - 15} more...
                                        (use search to narrow down)
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div
                            style={{
                                fontSize: "12px",
                                color: "#ccc",
                                textAlign: "center",
                            }}
                        >
                            Loading animations...
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

export default App;
