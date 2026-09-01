using System;
using System.Collections.Generic;
using System.Text;

namespace Lumio.Game.ServerGameplay;

/// <summary>
/// Room-local authoritative Chat ECS host: owner-thread SetMessage, next-tick commit, persist-only last-message state.
/// Does not own transport, Account Server, or a chat history list.
/// </summary>
public sealed class ChatRoomWorld
{
    private readonly int _ownerThreadId;
    private readonly object _gate = new();
    private readonly Dictionary<ulong, MutableComponent> _components = new();
    private readonly HashSet<ulong> _retired = new();
    private readonly HashSet<ulong> _committedSendersThisTick = new();
    private readonly Queue<PendingInput> _ingress = new();
    private ulong _nextMessageId = 1;

    /// <summary>Binds the creating thread as the Simulation Owner Thread.</summary>
    public ChatRoomWorld()
    {
        _ownerThreadId = Environment.CurrentManagedThreadId;
    }

    /// <summary>Last committed authoritative tick. Zero before the first <see cref="RunTick"/>.</summary>
    public ulong CurrentTick { get; private set; }

    /// <summary>True after an owner-thread fail-stop.</summary>
    public bool IsFaulted { get; private set; }

    /// <summary>Managed thread id of the simulation owner.</summary>
    public int OwnerThreadId => _ownerThreadId;

    /// <summary>Attaches an empty ChatComponent to a live NetEntityId. Owner thread only.</summary>
    public bool TryCreateEntity(ulong netEntityId)
    {
        lock (_gate)
        {
            if (!IsOwnerThread())
            {
                IsFaulted = true;
                return false;
            }

            if (IsFaulted || netEntityId == 0UL || _retired.Contains(netEntityId) || _components.ContainsKey(netEntityId))
            {
                return false;
            }

            _components.Add(netEntityId, new MutableComponent());
            return true;
        }
    }

    /// <summary>Destroys the entity and retires its NetEntityId. Owner thread only.</summary>
    public bool DestroyEntity(ulong netEntityId)
    {
        lock (_gate)
        {
            if (!IsOwnerThread())
            {
                IsFaulted = true;
                return false;
            }

            if (IsFaulted || !_components.Remove(netEntityId))
            {
                return false;
            }

            _retired.Add(netEntityId);
            return true;
        }
    }

    /// <summary>Reads the committed last-message snapshot for a live entity.</summary>
    public bool TryGetComponent(ulong netEntityId, out ChatComponent component)
    {
        lock (_gate)
        {
            if (_components.TryGetValue(netEntityId, out MutableComponent? slot))
            {
                component = new ChatComponent(slot.LastMessageText, slot.LastMessageTick);
                return true;
            }

            component = null!;
            return false;
        }
    }

    /// <summary>
    /// Captures a ChatInput for the next fixed tick. Safe from a network thread: it queues only and never writes component state.
    /// </summary>
    public ChatOperationResult AdmitChatInput(ulong senderNetEntityId, ChatInput input)
    {
        if (input.Text is null)
        {
            throw new ArgumentException("ChatInput.Text is required.", nameof(input));
        }

        lock (_gate)
        {
            if (IsFaulted)
            {
                return ChatOperationResult.Rejected(ChatErrorCodes.WorldFaulted);
            }

            if (ExceedsTextCap(input.Text))
            {
                return ChatOperationResult.Rejected(ChatErrorCodes.ChatTextTooLong);
            }

            if (_ingress.Count >= ChatMapping.IngressQueueCapacity)
            {
                return ChatOperationResult.Rejected(ChatErrorCodes.QueueFull);
            }

            _ingress.Enqueue(new PendingInput(senderNetEntityId, input.Text));
            return ChatOperationResult.Admitted();
        }
    }

    /// <summary>
    /// Authoritative SetMessage. Must run on the Simulation Owner Thread through the command/commit path.
    /// Off-thread calls fail-stop with zero component writes.
    /// </summary>
    public ChatOperationResult SetMessage(ulong senderNetEntityId, string text)
    {
        if (text is null)
        {
            throw new ArgumentNullException(nameof(text));
        }

        lock (_gate)
        {
            if (!TryEnterOwnerWrite(out ChatOperationResult rejection))
            {
                return rejection;
            }

            return ApplySetMessage(senderNetEntityId, text, CurrentTick, events: null);
        }
    }

    /// <summary>Advances one fixed tick and commits admitted ChatInput via <see cref="SetMessage"/>.</summary>
    public ChatTickResult RunTick()
    {
        lock (_gate)
        {
            if (!TryEnterOwnerWrite(out ChatOperationResult rejection))
            {
                return new ChatTickResult(
                    CurrentTick,
                    new ChatOperationResult[] { rejection },
                    Array.Empty<ChatMessageEvent>());
            }

            CurrentTick++;
            _committedSendersThisTick.Clear();

            int pending = _ingress.Count;
            if (pending == 0)
            {
                return new ChatTickResult(
                    CurrentTick,
                    Array.Empty<ChatOperationResult>(),
                    Array.Empty<ChatMessageEvent>());
            }

            var results = new ChatOperationResult[pending];
            var events = new List<ChatMessageEvent>(pending);
            for (int i = 0; i < pending; i++)
            {
                PendingInput input = _ingress.Dequeue();
                results[i] = ApplySetMessage(input.SenderNetEntityId, input.Text, CurrentTick, events);
                if (IsFaulted)
                {
                    break;
                }
            }

            return new ChatTickResult(CurrentTick, results, events.ToArray());
        }
    }

    private ChatOperationResult ApplySetMessage(
        ulong senderNetEntityId,
        string text,
        ulong appliedTick,
        List<ChatMessageEvent>? events)
    {
        if (ExceedsTextCap(text))
        {
            return ChatOperationResult.Rejected(ChatErrorCodes.ChatTextTooLong);
        }

        if (!_components.TryGetValue(senderNetEntityId, out MutableComponent? slot))
        {
            return ChatOperationResult.Rejected(ChatErrorCodes.EntityDestroyed);
        }

        if (_committedSendersThisTick.Contains(senderNetEntityId))
        {
            return ChatOperationResult.Rejected(ChatErrorCodes.ChatRateExceeded);
        }

        slot.LastMessageText = text;
        slot.LastMessageTick = appliedTick;
        _committedSendersThisTick.Add(senderNetEntityId);

        events?.Add(new ChatMessageEvent(
            _nextMessageId,
            _nextMessageId,
            senderNetEntityId,
            text,
            appliedTick));
        _nextMessageId++;
        return ChatOperationResult.Committed();
    }

    private bool TryEnterOwnerWrite(out ChatOperationResult rejection)
    {
        if (!IsOwnerThread())
        {
            IsFaulted = true;
            rejection = ChatOperationResult.Fatal(ChatErrorCodes.OwnerThreadViolation);
            return false;
        }

        if (IsFaulted)
        {
            rejection = ChatOperationResult.Rejected(ChatErrorCodes.WorldFaulted);
            return false;
        }

        rejection = default;
        return true;
    }

    private bool IsOwnerThread() => Environment.CurrentManagedThreadId == _ownerThreadId;

    private static bool ExceedsTextCap(string text) =>
        Encoding.UTF8.GetByteCount(text) > ChatMapping.MaxTextUtf8Bytes;

    private readonly struct PendingInput
    {
        public PendingInput(ulong senderNetEntityId, string text)
        {
            SenderNetEntityId = senderNetEntityId;
            Text = text;
        }

        public ulong SenderNetEntityId { get; }

        public string Text { get; }
    }

    private sealed class MutableComponent
    {
        public string LastMessageText { get; set; } = string.Empty;

        public ulong LastMessageTick { get; set; }
    }
}
