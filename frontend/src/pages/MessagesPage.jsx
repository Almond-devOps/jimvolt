import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Archive, BadgeCheck, Check, CheckCheck, ImagePlus, LoaderCircle,
  MessageCircle, MoreVertical, Search, Send, ShieldAlert, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { resolveImageUrl } from '../utils/imageUrl.js';
import { IMAGE_ACCEPT_WITH_GIF, describeImageProblem, prepareImage } from '../utils/imageFiles.js';
import UserAvatar from '../components/UserAvatar.jsx';
import {
  archiveConversation, getConversation, getConversationMessages, getConversations,
  markConversationRead, reportConversation, sendConversationMessage, uploadMessageImages,
} from '../services/messageService.js';
import { formatNaira } from '../utils/format.js';

const formatTime = (value) => value
  ? new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  : '';

const formatListTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? formatTime(value)
    : new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short' }).format(date);
};

function uniqueMessages(current, incoming) {
  const byId = new Map(current.map((item) => [String(item.id), item]));
  incoming.forEach((item) => byId.set(String(item.id), item));
  return [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export default function MessagesPage() {
  const { user, socket, setUnreadMessageCount } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('conversation') || '');
  const [conversationDetails, setConversationDetails] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [messageText, setMessageText] = useState('');
  const [files, setFiles] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typing, setTyping] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const bottomRef = useRef(null);
  const historyRef = useRef(null);
  const previousHistoryHeight = useRef(null);
  const filesRef = useRef([]);
  const typingTimer = useRef(null);
  const peerTypingTimer = useRef(null);
  const typingActive = useRef(false);
  const fileInput = useRef(null);
  filesRef.current = files;

  useEffect(() => () => {
    filesRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
  }, []);

  const loadConversations = useCallback(async (term = '') => {
    try {
      const { data } = await getConversations(term ? { q: term } : {});
      setConversations(data.conversations || []);
      setUnreadMessageCount(Number(data.unreadCount || 0));
      setListError('');
    } catch (requestError) {
      setListError(requestError.response?.data?.message || 'Could not load your conversations.');
    } finally {
      setLoadingList(false);
    }
  }, [setUnreadMessageCount]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadConversations(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search, loadConversations]);

  useEffect(() => {
    const queryId = searchParams.get('conversation');
    if (queryId && queryId !== selectedId) setSelectedId(queryId);
  }, [searchParams, selectedId]);

  const selectedSummary = useMemo(
    () => conversations.find((item) => String(item.id) === String(selectedId)),
    [conversations, selectedId],
  );
  const activeConversation = conversationDetails || selectedSummary;
  const partner = activeConversation?.other_user;
  const product = activeConversation?.advertisement;
  const isOnline = partner ? Boolean(onlineUsers[String(partner.id)]) : false;

  const loadOlderMessages = async () => {
    if (!selectedId || !messages.length || loadingOlder) return;
    setLoadingOlder(true);
    setError('');
    try {
      const { data } = await getConversationMessages(selectedId, {
        beforeId: messages[0].id,
        limit: 30,
      });
      if (data.messages?.length) {
        previousHistoryHeight.current = historyRef.current?.scrollHeight ?? null;
        setMessages((current) => uniqueMessages(current, data.messages));
      }
      setHasMoreMessages(Boolean(data.hasMore));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load earlier messages.');
    } finally {
      setLoadingOlder(false);
    }
  };

  useEffect(() => {
    if (!selectedId) {
      setConversationDetails(null);
      setMessages([]);
      return undefined;
    }
    let active = true;
    setLoadingMessages(true);
    setError('');
    Promise.all([
      getConversation(selectedId),
      getConversationMessages(selectedId),
    ])
      .then(async ([conversationResult, messagesResult]) => {
        if (!active) return;
        setConversationDetails(conversationResult.data.conversation);
        setMessages(messagesResult.data.messages || []);
        setHasMoreMessages(Boolean(messagesResult.data.hasMore));
        if (socket?.connected) {
          socket.emit('conversation:join', selectedId, (result) => {
            if (result?.ok && active) setOnlineUsers((current) => ({ ...current, ...result.presence }));
          });
        }
        await markConversationRead(selectedId);
        if (!active) return;
        setConversations((current) => current.map((item) => (
          String(item.id) === String(selectedId) ? { ...item, unread_count: 0 } : item
        )));
        await loadConversations(search.trim());
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Could not load this conversation.');
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => {
      active = false;
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      if (peerTypingTimer.current) window.clearTimeout(peerTypingTimer.current);
      typingActive.current = false;
      setTyping(false);
      socket?.emit('typing:stop', selectedId);
      socket?.emit('conversation:leave', selectedId);
    };
  }, [selectedId, socket, loadConversations]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleNewMessages = ({ conversationId, messages: incoming }) => {
      setConversations((current) => current.map((item) => {
        if (String(item.id) !== String(conversationId) || !incoming?.length) return item;
        const latest = incoming[incoming.length - 1];
        return {
          ...item,
          updated_at: latest.created_at,
          last_message: {
            id: latest.id,
            type: latest.message_type,
            content: latest.message_content,
            sender_id: latest.sender_id,
            created_at: latest.created_at,
          },
        };
      }));
      if (String(conversationId) === String(selectedId)) {
        setMessages((current) => uniqueMessages(current, incoming || []));
        if (incoming?.some((item) => String(item.sender_id) !== String(user?.id))) {
          markConversationRead(conversationId).catch((requestError) => {
            setError(requestError.response?.data?.message || 'Could not mark incoming messages as read.');
          });
        }
      }
      loadConversations(search.trim());
    };
    const handleRead = ({ conversationId, userId }) => {
      if (String(conversationId) === String(selectedId) && String(userId) !== String(user?.id)) {
        setMessages((current) => current.map((item) => (
          String(item.sender_id) === String(user?.id) ? { ...item, is_read: true } : item
        )));
      }
    };
    const handleDelivered = ({ conversationId, userId }) => {
      if (String(conversationId) === String(selectedId) && String(userId) !== String(user?.id)) {
        setMessages((current) => current.map((item) => (
          String(item.sender_id) === String(user?.id)
            ? { ...item, delivered_at: item.delivered_at || new Date().toISOString() }
            : item
        )));
      }
    };
    const handleTyping = ({ conversationId, userId, isTyping }) => {
      if (String(conversationId) === String(selectedId) && String(userId) !== String(user?.id)) {
        setTyping(Boolean(isTyping));
        if (peerTypingTimer.current) window.clearTimeout(peerTypingTimer.current);
        if (isTyping) {
          peerTypingTimer.current = window.setTimeout(() => setTyping(false), 3500);
        }
      }
    };
    const handlePresence = ({ userId, online: nextOnline }) => {
      setOnlineUsers((current) => ({ ...current, [String(userId)]: nextOnline }));
    };
    const joinCurrentConversation = () => {
      if (selectedId) {
        socket.emit('conversation:join', selectedId, (result) => {
          if (result?.ok) setOnlineUsers((current) => ({ ...current, ...result.presence }));
        });
      }
    };
    const handleInitialPresence = (userIds) => {
      setOnlineUsers((current) => {
        const next = { ...current };
        (userIds || []).forEach((id) => { next[String(id)] = true; });
        return next;
      });
    };
    socket.on('message:new', handleNewMessages);
    socket.on('message:read', handleRead);
    socket.on('message:delivered', handleDelivered);
    socket.on('typing:update', handleTyping);
    socket.on('presence:update', handlePresence);
    socket.on('presence:initial', handleInitialPresence);
    socket.on('connect', joinCurrentConversation);
    if (socket.connected) joinCurrentConversation();
    return () => {
      socket.off('message:new', handleNewMessages);
      socket.off('message:read', handleRead);
      socket.off('message:delivered', handleDelivered);
      socket.off('typing:update', handleTyping);
      socket.off('presence:update', handlePresence);
      socket.off('presence:initial', handleInitialPresence);
      socket.off('connect', joinCurrentConversation);
    };
  }, [socket, selectedId, user?.id, loadConversations, search]);

  useEffect(() => {
    if (previousHistoryHeight.current !== null && historyRef.current) {
      historyRef.current.scrollTop += historyRef.current.scrollHeight - previousHistoryHeight.current;
      previousHistoryHeight.current = null;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  const selectConversation = (conversation) => {
    setSelectedId(String(conversation.id));
    setConversationDetails(conversation);
    setSearchParams({ conversation: String(conversation.id) });
  };

  const handleTyping = (value) => {
    setMessageText(value);
    if (!selectedId || !socket?.connected) return;
    if (!typingActive.current && value.trim()) {
      typingActive.current = true;
      socket.emit('typing:start', selectedId);
    }
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      typingActive.current = false;
      socket.emit('typing:stop', selectedId);
    }, 900);
    if (!value.trim() && typingActive.current) {
      typingActive.current = false;
      socket.emit('typing:stop', selectedId);
    }
  };

  const addFiles = async (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    const accepted = [];
    const problems = [];
    for (const original of selected) {
      const problem = describeImageProblem(original, { allowGif: true });
      if (problem) {
        problems.push(`"${original.name}" ${problem}`);
        continue;
      }
      const file = await prepareImage(original);
      if (file.size > 5 * 1024 * 1024) problems.push(`"${original.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Each image must be 5 MB or smaller.`);
      else accepted.push({ file, preview: URL.createObjectURL(file) });
    }
    const remaining = Math.max(0, 4 - files.length)
    if (accepted.length > remaining) {
      accepted.slice(remaining).forEach((item) => URL.revokeObjectURL(item.preview))
      problems.push('You can attach up to four images per message.')
    }
    setFiles((current) => [...current, ...accepted.slice(0, remaining)].slice(0, 4));
    setError(problems.join(' '));
  };

  const removeFile = (preview) => {
    setFiles((current) => {
      const removed = current.find((item) => item.preview === preview);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((item) => item.preview !== preview);
    });
  };

  const send = async (event) => {
    event.preventDefault();
    if ((!messageText.trim() && !files.length) || !selectedId || sending) return;
    setSending(true);
    setError('');
    try {
      const attachments = files.length ? await uploadMessageImages(files.map((item) => item.file)) : [];
      const { data } = await sendConversationMessage(selectedId, {
        message: messageText.trim(),
        attachments,
      });
      setMessages((current) => uniqueMessages(current, data.messages || []));
      setMessageText('');
      files.forEach((item) => URL.revokeObjectURL(item.preview));
      setFiles([]);
      typingActive.current = false;
      socket?.emit('typing:stop', selectedId);
      await loadConversations(search.trim());
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const archive = async () => {
    if (!selectedId) return;
    try {
      await archiveConversation(selectedId);
      setConversations((current) => current.filter((item) => String(item.id) !== String(selectedId)));
      setSelectedId('');
      setConversationDetails(null);
      setMessages([]);
      setSearchParams({});
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not archive this conversation.');
    }
  };

  const report = async () => {
    if (!selectedId) return;
    const description = window.prompt('Briefly explain why you are reporting this conversation (at least 10 characters):');
    if (!description) return;
    try {
      await reportConversation(selectedId, { description });
      setError('');
      window.alert('Your report has been sent to the Jimvolt moderation team.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not submit the report.');
    }
  };

  return (
    <div className="container section messages-page">
      <header className="section-head messages-page-heading">
        <div><p className="eyebrow">Private buyer and seller chat</p><h1>Messages</h1><p className="muted">Discuss products directly and safely on Jimvolt.</p></div>
      </header>
      {listError && <div className="notice error" role="alert">{listError}</div>}
      <div className={`messaging-shell ${selectedId ? 'has-conversation' : ''}`}>
        <aside className="conversation-sidebar">
          <div className="conversation-sidebar-head">
            <h2>Inbox</h2>
            <span>{conversations.length}</span>
          </div>
          <label className="conversation-search">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
          </label>
          {loadingList ? <div className="conversation-loading"><span /><span /><span /></div>
            : !conversations.length ? <div className="conversation-empty"><MessageCircle size={26} /><p>{search ? 'No matching conversations.' : 'No conversations yet.'}</p>{!search && <Link to="/ads">Browse products</Link>}</div>
              : <div className="conversation-list">{conversations.map((conversation) => {
                const person = conversation.other_user;
                const last = conversation.last_message;
                return <button
                  type="button"
                  className={`conversation-row ${String(selectedId) === String(conversation.id) ? 'selected' : ''}`}
                  key={conversation.id}
                  onClick={() => selectConversation(conversation)}
                >
                  <span className="chat-avatar-wrap">
                    <UserAvatar src={person.profile_image} name={person.name} className="chat-avatar chat-avatar-fallback" />
                    <i className={`presence-dot ${onlineUsers[String(person.id)] ? 'online' : ''}`} />
                  </span>
                  <span className="conversation-row-body">
                    <span className="conversation-row-title"><strong>{person.name}</strong><time>{formatListTime(last?.created_at || conversation.updated_at)}</time></span>
                    <span className="conversation-row-preview">{last?.message_type === 'image' ? 'Image' : last?.content || conversation.advertisement?.title || 'Product enquiry'}</span>
                    <span className="conversation-row-product">{conversation.advertisement?.title || 'Marketplace conversation'}</span>
                  </span>
                  {conversation.unread_count > 0 && <span className="unread-badge">{conversation.unread_count > 99 ? '99+' : conversation.unread_count}</span>}
                </button>;
              })}</div>}
        </aside>

        <section className="conversation-panel" aria-label="Conversation">
          {!selectedId || !activeConversation ? <div className="chat-welcome">
            <div><MessageCircle size={36} /><h2>Your conversations</h2><p>Select a conversation or start a chat from any product advertisement.</p><Link className="btn btn-primary" to="/ads">Browse products</Link></div>
          </div> : <>
            <header className="chat-header">
              <button type="button" className="chat-back" onClick={() => { setSelectedId(''); setConversationDetails(null); setSearchParams({}); }} aria-label="Back to conversations"><ArrowLeft size={19} /></button>
              <span className="chat-avatar-wrap">
                <UserAvatar src={partner?.profile_image} name={partner?.name} className="chat-avatar chat-avatar-fallback" />
                <i className={`presence-dot ${isOnline ? 'online' : ''}`} />
              </span>
              <div className="chat-header-person">
                <strong>{partner?.name || 'Marketplace user'} {partner?.is_verified && <BadgeCheck size={15} className="verified-mark" />}</strong>
                <span className={isOnline ? 'online-text' : ''}>{typing ? 'Typing…' : isOnline ? 'Online' : 'Offline'}</span>
              </div>
              {product && <Link className="chat-product-link" to={`/ads/${product.id}`}>
                {product.image && <img src={resolveImageUrl(product.image)} alt="" />}
                <span><strong>{product.title}</strong><small>{formatNaira(product.price)}</small></span>
              </Link>}
              <div className="chat-actions">
                <button type="button" title="Report conversation" aria-label="Report conversation" onClick={report}><ShieldAlert size={18} /></button>
                <button type="button" title="Archive conversation" aria-label="Archive conversation" onClick={archive}><Archive size={18} /></button>
              </div>
            </header>
            {product && <Link className="chat-product-mobile" to={`/ads/${product.id}`}><span>About: <strong>{product.title}</strong></span><span>{formatNaira(product.price)}</span></Link>}
            <div className="chat-history" aria-live="polite" ref={historyRef}>
              {hasMoreMessages && <button type="button" className="load-older-messages" onClick={loadOlderMessages} disabled={loadingOlder}>
                {loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}
              </button>}
              {loadingMessages ? <div className="chat-loading"><LoaderCircle className="spin" /> Loading messages…</div>
                : error ? <div className="notice error" role="alert">{error}</div>
                  : !messages.length ? <div className="chat-first-message"><MessageCircle size={26} /><p>Say hello to start the conversation.</p></div>
                    : messages.map((item) => {
                      const own = String(item.sender_id) === String(user?.id);
                      return <article className={`chat-message ${own ? 'own' : 'theirs'}`} key={item.id}>
                        {item.message_type === 'image' && item.attachment_url
                          ? <a href={item.attachment_url} target="_blank" rel="noreferrer"><img className="chat-attachment" src={item.attachment_url} alt="Shared attachment" /></a>
                          : <p>{item.message_content}</p>}
                        <div className="chat-message-meta"><time>{formatTime(item.created_at)}</time>{own && (item.is_read ? <CheckCheck size={14} className="read-receipt" aria-label="Read" title="Read" /> : item.delivered_at ? <CheckCheck size={14} aria-label="Delivered" title="Delivered" /> : <Check size={14} aria-label="Sent" title="Sent" />)}</div>
                      </article>;
                    })}
              {typing && <div className="typing-indicator"><i /><i /><i /></div>}
              <div ref={bottomRef} />
            </div>
            {error && !loadingMessages && <div className="chat-inline-error" role="alert">{error}</div>}
            {files.length > 0 && <div className="attachment-previews">{files.map((item) => <span key={item.preview}>
              <img src={item.preview} alt="Selected attachment preview" />
              <button type="button" onClick={() => removeFile(item.preview)} aria-label="Remove image"><X size={14} /></button>
            </span>)}</div>}
            <form className="chat-composer" onSubmit={send}>
              <input ref={fileInput} type="file" accept={IMAGE_ACCEPT_WITH_GIF} multiple hidden onChange={addFiles} />
              <button type="button" className="composer-attach" aria-label="Attach images" title="Attach images" onClick={() => fileInput.current?.click()} disabled={files.length >= 4}><ImagePlus size={20} /></button>
              <textarea value={messageText} onChange={(event) => handleTyping(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); }
              }} rows="1" maxLength="2000" placeholder="Write a message…" aria-label="Write a message" />
              <button type="submit" className="send-message-btn" disabled={sending || (!messageText.trim() && !files.length)} aria-label="Send message">
                {sending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
              </button>
            </form>
            <p className="chat-safety-note"><MoreVertical size={13} /> Never share passwords or payment details in chat.</p>
          </>}
        </section>
      </div>
    </div>
  );
}
