import React, { useState, useRef, useEffect, Fragment } from 'react';
import styled from 'styled-components';
import { sendMessageToLuna } from '../services/chatService'; 
import { getChatHistory } from '../services/firebase'; 
import { useAuthSubscription } from '../context/AuthSubscriptionContext'; 

// Define the structure for a chat message
interface ChatMessage {
    id: string; 
    sender: 'user' | 'luna' | 'system'; 
    text: string;
}

// Styled Components
const ChatContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: calc(100vh - 150px); 
    max-width: 800px;
    margin: 20px auto;
    border: 1px solid #ccc;
    border-radius: 8px;
    overflow: hidden;
    background-color: #f9f9f9; 
`;

const MessageArea = styled.div`
    flex-grow: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px; 
`;

interface MessageBubbleProps {
    sender: 'user' | 'luna' | 'system';
}

const MessageBubble = styled.div<MessageBubbleProps>`
    padding: 10px 15px;
    border-radius: 18px;
    max-width: 75%;
    word-wrap: break-word;
    align-self: ${props => props.sender === 'user' ? 'flex-end' : 'flex-start'};
    background-color: ${props => {
        switch (props.sender) {
            case 'user': return '#006D77'; 
            case 'luna': return '#e0e0e0'; 
            case 'system': return '#f8d7da'; 
            default: return '#eee';
        }
    }};
    color: ${props => props.sender === 'user' ? 'white' : (props.sender === 'system' ? '#721c24' : 'black')}; 
    margin-bottom: 5px; 
`;

const InputArea = styled.div`
    display: flex;
    padding: 10px;
    border-top: 1px solid #ccc;
    background-color: #fff;
`;

const MessageInput = styled.input`
    flex-grow: 1;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 20px;
    margin-right: 10px;
    font-size: 1rem;
`;

const SendButton = styled.button`
    padding: 10px 20px;
    background-color: #6247AA; 
    color: white;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    font-size: 1rem;
    transition: background-color 0.2s ease;

    &:hover {
        background-color: #4a368b; 
    }

    &:disabled {
        background-color: #ccc;
        cursor: not-allowed;
    }
`;

const LoadingIndicator = styled.div`
    text-align: center;
    padding: 10px;
    color: #666;
    font-style: italic;
`;

const EnergyBalanceDisplay = styled.div`
    padding: 5px 15px;
    text-align: right;
    font-size: 0.9em;
    color: #333;
    background-color: #f0f0f0;
    border-bottom: 1px solid #ccc;
`;

// Helper function to parse message text and render HTML within specific tags
const parseAndRenderMessage = (text: string): React.ReactNode[] => {
  // Regex to find {0[HTML]0}...{0[/HTML]0} blocks, capturing the content inside
  const regex = /{0\[HTML\]0}(.*?){\0\[\/HTML\]0}/gs;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let keyIndex = 0;

  for (const match of text.matchAll(regex)) {
    const htmlContent = match[1]; // Captured HTML content
    // match.index can be undefined in some JS environments, provide fallback
    const matchStartIndex = match.index ?? 0;

    // Add the plain text part before the match
    if (matchStartIndex > lastIndex) {
      parts.push(
        <Fragment key={`text-${keyIndex++}`}>
          {text.substring(lastIndex, matchStartIndex)}
        </Fragment>
      );
    }

    // Add the HTML part, rendered using dangerouslySetInnerHTML within a span
    if (htmlContent) {
         parts.push(
            <span
                key={`html-${keyIndex++}`}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
         );
    }

    // Update lastIndex to the position after the current match
    lastIndex = matchStartIndex + match[0].length;
  }

  // Add any remaining plain text after the last match
  if (lastIndex < text.length) {
    parts.push(
      <Fragment key={`text-${keyIndex++}`}>
        {text.substring(lastIndex)}
      </Fragment>
    );
  }

  // If the text had no matches, return the original text as a single fragment
  if (parts.length === 0 && text) {
       parts.push(<Fragment key={`text-${keyIndex++}`}>{text}</Fragment>);
  }

  return parts;
};

const ChatPage: React.FC = () => {
  const { currentUser, firestoreUserData, stripeRole, loading: authLoading } = useAuthSubscription();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false); 
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messageAreaRef = useRef<HTMLDivElement>(null);

  // Effect for auth state and initial setup (now simplified by context)
  useEffect(() => {
    if (!authLoading && currentUser) {
      setIsHistoryLoading(true);
      setError(null);
      getChatHistory(currentUser.uid)
        .then(history => {
          // Map Firestore history to ChatMessage interface
          const mappedHistory: ChatMessage[] = history.map((doc: any) => ({ // Assuming doc has id, role, content
            id: doc.id, 
            sender: doc.role === 'assistant' ? 'luna' : (doc.role === 'system' ? 'system' : 'user'), 
            text: doc.content,
          }));
          setMessages(mappedHistory);
          setIsHistoryLoading(false);
        })
        .catch(err => {
          console.error("ChatPage Error fetching chat history:", err);
          setError('Failed to load chat history. Please refresh the page.');
          setIsHistoryLoading(false);
        });
    } else if (!authLoading && !currentUser) {
      // User is logged out or not yet loaded
      setMessages([]);
      setIsHistoryLoading(false); // Not loading if no user
      setError(null); // Clear error on logout
    }
  }, [currentUser, authLoading]);

  // Scroll to bottom when messages change
  useEffect(() => {
      if (messageAreaRef.current) {
          messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;
      }
  }, [messages]);

  const handleSendMessage = async () => {
      const trimmedInput = inputValue.trim();
      if (!trimmedInput) return; 

      // Add user message immediately
      const userMessage: ChatMessage = {
          id: `user-${Date.now()}`, 
          sender: 'user',
          text: trimmedInput,
      };
      setMessages(prevMessages => [...prevMessages, userMessage]);
      setInputValue(''); 
      setIsLoading(true);
      setError(null);

      // Ensure user is still logged in before sending
      if (!currentUser) {
        setError("You must be logged in to chat.");
        setIsLoading(false);
        return;
      }

      try {
          // Pass the ID token from the current user
          const idToken = await currentUser.getIdToken();
          const response = await sendMessageToLuna(trimmedInput, idToken); 

          // Check for backend error in response body
          if (response.error) {
              const errorMessage: ChatMessage = {
                  id: `system-error-${Date.now()}`,
                  sender: 'system',
                  text: `Error: ${response.error}${response.details ? ` (${response.details})` : ''}`,
              };
               setMessages(prevMessages => [...prevMessages, errorMessage]);
               setError(`Backend Error: ${response.error}`); 
          } else {
               // Add Luna's reply
              const lunaMessage: ChatMessage = {
                  id: `luna-${Date.now()}`,
                  sender: 'luna',
                  text: response.reply,
              };
              setMessages(prevMessages => [...prevMessages, lunaMessage]);
          }

      } catch (err: any) {
          console.error("ChatPage Error sending message:", err);
          const errorMessageText = err.message || 'Failed to connect to Luna. Please try again.';
           const errorMessage: ChatMessage = {
              id: `system-error-${Date.now()}`,
              sender: 'system',
              text: `Error: ${errorMessageText}`,
          };
          setMessages(prevMessages => [...prevMessages, errorMessage]);
          setError(errorMessageText); 
      } finally {
          setIsLoading(false);
      }
  };

  // Handle Enter key press in input
  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !isLoading) {
          handleSendMessage();
      }
  };

  return (
      <ChatContainer>
          <h1>Chat with Luna</h1>
          {/* Display Energy Balance if user is logged in and firestoreUserData is available */}
          {!authLoading && currentUser && firestoreUserData && firestoreUserData.energyPoints !== undefined && (
            <EnergyBalanceDisplay>
                Energy: {firestoreUserData.energyPoints.toFixed(0)}
            </EnergyBalanceDisplay>
          )}
          <MessageArea ref={messageAreaRef}>
              {isHistoryLoading ? (
                  <LoadingIndicator>Loading chat history...</LoadingIndicator>
              ) : error ? (
                   <MessageBubble sender="system">{error}</MessageBubble>
              ) : messages.length === 0 ? (
                  <LoadingIndicator>Start your conversation with Luna!</LoadingIndicator> 
              ) : (
                  messages.map(msg => (
                      <MessageBubble key={msg.id} sender={msg.sender}>
                          {/* Use the parser function to render content */}
                          {parseAndRenderMessage(msg.text)}
                      </MessageBubble>
                  ))
              )}
              {isLoading && <LoadingIndicator>Luna is thinking...</LoadingIndicator>}
          </MessageArea>
          <InputArea>
              <MessageInput
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  disabled={isLoading || isHistoryLoading || !currentUser || authLoading} 
              />
              <SendButton
                  onClick={handleSendMessage}
                  disabled={isLoading || isHistoryLoading || !inputValue.trim() || !currentUser || authLoading} 
              >
                  Send
              </SendButton>
          </InputArea>
          {/* Optional: Display persistent error outside message area */}
          {/* {error && <div style={{ color: 'red', padding: '10px' }}>{error}</div>} */}
      </ChatContainer>
  );
};

export default ChatPage;
