import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Message = {
  id: string;
  role: 'user' | 'ai';
  text: string;
};

type Chat = {
  id: string;
  conversationId?: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};

const API_URL = 'https://naijasabi-ai.onrender.com/chat';
const STORAGE_KEY = 'naijasabi.chats.v1';
const PROFILE_KEY = 'naijasabi.profile.v1';

function getGreeting(name: string) {
  const hour = new Date().getHours();

  if (hour < 12) {
    return `Good morning, ${name}. ☀️\\n\\nHow can I help you?`;
  }

  if (hour < 17) {
    return `Good afternoon, ${name}. 👋🏽\\n\\nHow can I help you?`;
  }

  if (hour < 21) {
    return `Hey ${name} — what's good this evening? 🌆\\n\\nHow can I help you?`;
  }

  return `Good evening, ${name}. 🌙\\n\\nHow can I help you?`;
}

export default function HomeScreen() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [profileName, setProfileName] = useState('there');
  const [externalId, setExternalId] = useState('');

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (!ready || !currentChatId) return;

    saveCurrentChat();
  }, [messages]);

  async function loadChats() {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const savedProfile = await AsyncStorage.getItem(PROFILE_KEY);

      let savedChats: Chat[] = [];

      if (saved) {
        savedChats = JSON.parse(saved);
      }

      if (savedProfile) {
        try {
          const profile = JSON.parse(savedProfile);

          if (profile.name) {
            setProfileName(profile.name);
          }

          if (profile.externalId) {
            setExternalId(profile.externalId);
          }
        } catch {
          // Ignore malformed old profile data.
        }
      }

      let currentExternalId = '';

      if (savedProfile) {
        try {
          const profile = JSON.parse(savedProfile);
          currentExternalId = profile.externalId || '';
        } catch {}
      }

      if (!currentExternalId) {
        currentExternalId = `device-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

        await AsyncStorage.setItem(
          PROFILE_KEY,
          JSON.stringify({
            name: 'there',
            externalId: currentExternalId,
          })
        );

        setExternalId(currentExternalId);
      }

      setChats(savedChats);

      // IMPORTANT:
      // Every app launch starts a completely fresh chat.
      const newChat = createChat(
        savedProfile
          ? (() => {
              try {
                const profile = JSON.parse(savedProfile);
                return profile.name || 'there';
              } catch {
                return 'there';
              }
            })()
          : 'there'
      );

      setCurrentChatId(newChat.id);
      setMessages(newChat.messages);
      setReady(true);

    } catch (error) {
      console.log('Could not load chats:', error);

      const newChat = createChat('there');

      setCurrentChatId(newChat.id);
      setMessages(newChat.messages);
      setReady(true);
    }
  }

  function createChat(name = profileName): Chat {
    const now = Date.now();

    return {
      id: `${now}-${Math.random().toString(36).slice(2)}`,
      title: 'New conversation',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: `welcome-${now}`,
          role: 'ai',
          text: getGreeting(name || 'there'),
        },
      ],
    };
  }

  async function saveCurrentChat() {
    if (!currentChatId) return;

    setChats((currentChats) => {
      const updatedChats = currentChats.map((chat) =>
        chat.id === currentChatId
          ? {
              ...chat,
              messages,
              updatedAt: Date.now(),
            }
          : chat
      );

      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(updatedChats)
      ).catch((error) =>
        console.log('Could not save chats:', error)
      );

      return updatedChats;
    });
  }

  function startNewChat() {
    const newChat = createChat(profileName);

    setChats((currentChats) => {
      const updated = [newChat, ...currentChats];
      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(updated)
      ).catch((error) =>
        console.log('Could not save new chat:', error)
      );

      return updated;
    });

    setCurrentChatId(newChat.id);
    setMessages(newChat.messages);
    setInput('');
    setHistoryVisible(false);
  }

async function deleteChat(chatId: string) {
  const updatedChats = chats.filter((chat) => chat.id !== chatId);

  if (updatedChats.length === 0) {
    const newChat = createChat(profileName);

    setChats([newChat]);
    setCurrentChatId(newChat.id);
    setMessages(newChat.messages);

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([newChat])
    );

    return;
  }

  setChats(updatedChats);

  if (chatId === currentChatId) {
    const nextChat = updatedChats[0];

    setCurrentChatId(nextChat.id);
    setMessages(nextChat.messages);
  }

  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(updatedChats)
  );
}
 
 function openChat(chat: Chat) {
    setCurrentChatId(chat.id);
    setMessages(chat.messages);
    setInput('');
    setHistoryVisible(false);
  }

  async function sendMessage() {
    const message = input.trim();

    if (!message || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: message,
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          conversation_id:
            chats.find((chat) => chat.id === currentChatId)
              ?.conversationId || null,
          external_id: externalId,
          display_name: profileName === 'there'
            ? ''
            : profileName,
          history: updatedMessages
            .filter((item) => !item.id.startsWith('welcome-'))
            .map((item) => ({
              role: item.role,
              content: item.text,
            })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI request failed');
      }

      const aiMessage: Message = {
        id: `${Date.now()}-ai`,
        role: 'ai',
        text: data.reply,
      };

      setMessages((current) => [...current, aiMessage]);

      if (data.conversation_id) {
        setChats((currentChats) => {
          const updatedChats = currentChats.map((chat) =>
            chat.id === currentChatId
              ? {
                  ...chat,
                  conversationId: Number(data.conversation_id),
                  messages: [...updatedMessages, aiMessage],
                  updatedAt: Date.now(),
                }
              : chat
          );

          AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(updatedChats)
          ).catch((error) =>
            console.log('Could not save cloud chat reference:', error)
          );

          return updatedChats;
        });
      }
    } catch (error) {
      console.log('AI error:', error);

      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          role: 'ai',
        text: 'NAIJASABI AI is temporarily busy. Please try again shortly.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const currentChat = chats.find(
    (chat) => chat.id === currentChatId
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>NAIJASABI AI 🇳🇬</Text>
            <Text style={styles.status}>● AI ONLINE</Text>
          </View>

          <View style={styles.headerButtons}>
            <Pressable
              onPress={() => setHistoryVisible(true)}
              style={styles.headerButton}
            >
              <Text style={styles.headerButtonText}>History</Text>
            </Pressable>

            <Pressable
              onPress={startNewChat}
              style={styles.headerButton}
            >
              <Text style={styles.headerButtonText}>+ New</Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messages}
          renderItem={({ item }) => (
            <View
              style={[
                styles.message,
                item.role === 'user'
                  ? styles.userMessage
                  : styles.aiMessage,
              ]}
            >
              <Text style={styles.messageLabel}>
                {item.role === 'user' ? 'You' : 'NAIJASABI AI'}
              </Text>

              <Text style={styles.messageText}>
                {item.text}
              </Text>
            </View>
          )}
        />

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>
              NAIJASABI AI is thinking...
            </Text>
          </View>
        )}

        <View style={styles.inputArea}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask NAIJASABI AI anything..."
            placeholderTextColor="#777"
            style={styles.input}
            multiline
            maxLength={4000}
          />

          <Pressable
            onPress={sendMessage}
            disabled={!input.trim() || loading}
            style={[
              styles.sendButton,
              (!input.trim() || loading) &&
                styles.sendButtonDisabled,
            ]}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>

        <Modal
          visible={historyVisible}
          animationType="slide"
          onRequestClose={() => setHistoryVisible(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chat History</Text>

              <Pressable
                onPress={() => setHistoryVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={startNewChat}
              style={styles.newChatLarge}
            >
              <Text style={styles.newChatLargeText}>
                + Start New Chat
              </Text>
            </Pressable>

            <FlatList
              data={chats}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.historyList}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  No saved conversations yet.
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openChat(item)}
                  style={[
                    styles.historyItem,
                    item.id === currentChatId &&
                      styles.activeHistoryItem,
                  ]}
                >
                  <Text style={styles.historyTitle}>
                    {getChatTitle(item)}
                  </Text>
<Pressable
  onPress={() => deleteChat(item.id)}
  style={styles.deleteButton}
>
  <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
</Pressable>

                 <Text style={styles.historyPreview} numberOfLines={2}>
                    {getLastMessage(item)}
                  </Text>

                  <Text style={styles.historyDate}>
                    {new Date(item.updatedAt).toLocaleString()}
                  </Text>
                </Pressable>
              )}
            />
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getChatTitle(chat: Chat) {
  const firstUserMessage = chat.messages.find(
    (message) => message.role === 'user'
  );

  if (!firstUserMessage) {
    return chat.title;
  }

  return firstUserMessage.text.length > 35
    ? `${firstUserMessage.text.slice(0, 35)}...`
    : firstUserMessage.text;
}

function getLastMessage(chat: Chat) {
  const last = chat.messages[chat.messages.length - 1];

  return last?.text || 'Empty conversation';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  keyboard: {
    flex: 1,
  },

  header: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  logo: {
    fontSize: 21,
    fontWeight: '800',
  },

  status: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
  },

  headerButtons: {
    flexDirection: 'row',
    gap: 7,
  },

  headerButton: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#111111',
  },

  headerButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },

  messages: {
    padding: 16,
    gap: 12,
  },

  message: {
    maxWidth: '88%',
    padding: 14,
    borderRadius: 16,
  },

  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f1f1',
  },

  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#dff5e8',
  },

  messageLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
  },

  messageText: {
    fontSize: 16,
    lineHeight: 23,
  },

  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },

  loadingText: {
    fontSize: 13,
  },

  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
  },

  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },

  sendButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111111',
  },

  sendButtonDisabled: {
    opacity: 0.4,
  },

  sendText: {
    color: '#ffffff',
    fontWeight: '800',
  },

  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  modalHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
  },

  closeButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#eeeeee',
  },

  closeButtonText: {
    fontWeight: '700',
  },

  newChatLarge: {
    margin: 16,
    padding: 15,
    borderRadius: 12,
    backgroundColor: '#111111',
    alignItems: 'center',
  },

  newChatLargeText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },

  historyList: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    gap: 10,
  },

  historyItem: {
    padding: 15,
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 14,
  },

deleteButton: {
  marginTop: 10,
  alignSelf: 'flex-start',
  paddingHorizontal: 12,
  paddingVertical: 7,
  borderRadius: 8,
  backgroundColor: '#eeeeee',
},

deleteButtonText: {
  fontSize: 13,
  fontWeight: '700',
},

  activeHistoryItem: {
    borderWidth: 2,
  },

  historyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },

  historyPreview: {
    marginTop: 5,
    fontSize: 14,
    color: '#555555',
  },

  historyDate: {
    marginTop: 8,
    fontSize: 11,
    color: '#888888',
  },

  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#777777',
  },
});
