using System;

namespace Lumio.Bomber.Client.Spectator;

internal readonly record struct BomberIntentSample(int Primary, int Secondary, bool TurnPressed,
    int BombPressPhase, int BombReleasePhase, bool Skill);

internal sealed class BomberPlayerIntent
{
    private const int Capacity = 5;
    private const string Refused = "player_bomb_intent_capacity";
    private readonly Gesture[] _gestures = new Gesture[Capacity];
    private int _head;
    private int _count;
    private bool _dropping;
    private bool _cancelDebt;
    private int _heldPrimary;
    private int _heldSecondary;
    private int _tapPrimary;
    private int _tapSecondary;
    private bool _turnPressed;
    private bool _skill;
    private int _bombIntentRefusalCount;
    private string _bombIntentStatusCode = "accepted";

    private struct Gesture
    {
        public bool BeginPublished;
        public int Terminal;
    }

    public int BombIntentRefusalCount => _bombIntentRefusalCount;
    public string BombIntentStatusCode => _bombIntentStatusCode;

    public void SetMoveIntent(int primary, int secondary, bool turnPressed)
    {
        _heldPrimary = primary;
        _heldSecondary = secondary;
        _turnPressed |= turnPressed;
        if (primary != 0 && turnPressed) {
            _tapPrimary = primary;
            _tapSecondary = secondary;
        }
    }

    public string SetBombIntent(int phase)
    {
        if (phase is not (1 or 3 or 4)) throw new ArgumentOutOfRangeException(nameof(phase));
        if (_dropping) {
            if (phase is 3 or 4) _dropping = false;
            return Refused;
        }
        if (phase == 1) {
            if (_count == Capacity) {
                _dropping = true;
                if (_bombIntentRefusalCount < int.MaxValue) _bombIntentRefusalCount++;
                _bombIntentStatusCode = Refused;
                return Refused;
            }
            if (_count != 0 && _gestures[(_head + _count - 1) % Capacity].Terminal == 0)
                return "accepted";
            _gestures[(_head + _count) % Capacity] = default;
            _count++;
            return "accepted";
        }
        if (_count == 0) return "accepted";
        int tail = (_head + _count - 1) % Capacity;
        if (_gestures[tail].Terminal != 0) return "accepted";
        if (phase == 4 && !_gestures[tail].BeginPublished) {
            _gestures[tail] = default;
            _count--;
            return "accepted";
        }
        _gestures[tail].Terminal = phase;
        return "accepted";
    }

    public void LatchSkillIntent() => _skill = true;

    public BomberIntentSample PeekSample(bool enabled)
    {
        if (_cancelDebt) return new BomberIntentSample(0, 0, false, 0, 4, false);
        if (!enabled) return default;
        int primary = _heldPrimary != 0 ? _heldPrimary : _tapPrimary;
        int secondary = _heldPrimary != 0 ? _heldSecondary : _tapSecondary;
        int press = 0;
        int release = 0;
        if (_count != 0) {
            ref Gesture head = ref _gestures[_head];
            press = head.BeginPublished ? (head.Terminal == 0 ? 2 : 0) : 1;
            release = head.Terminal;
        }
        return new BomberIntentSample(primary, secondary, _turnPressed, press, release, _skill);
    }

    public void CommitMove()
    {
        _tapPrimary = 0;
        _tapSecondary = 0;
        _turnPressed = false;
    }

    public void CommitBomb(int phase)
    {
        if (_count == 0) return;
        ref Gesture head = ref _gestures[_head];
        if (phase == 1 && !head.BeginPublished) {
            head.BeginPublished = true;
        } else if (phase is 3 or 4 && head.BeginPublished && head.Terminal == phase) {
            head = default;
            _head = (_head + 1) % Capacity;
            _count--;
            _cancelDebt = false;
        }
    }

    public void CommitSkill() => _skill = false;

    public void Clear()
    {
        _heldPrimary = _heldSecondary = _tapPrimary = _tapSecondary = 0;
        _turnPressed = _skill = false;
        bool debt = _count != 0 && _gestures[_head].BeginPublished;
        Array.Clear(_gestures);
        _head = 0;
        _count = debt ? 1 : 0;
        _cancelDebt = debt;
        if (debt) _gestures[0] = new Gesture { BeginPublished = true, Terminal = 4 };
    }

    public void Invalidate()
    {
        Clear();
        Array.Clear(_gestures);
        _count = 0;
        _cancelDebt = false;
        _dropping = false;
    }
}
