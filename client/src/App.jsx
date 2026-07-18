import { useEffect, useState, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(d) {
  return new Date(d).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("bf_token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("bf_user");
    return raw ? JSON.parse(raw) : null;
  });

  // "shows" | "seats" | "bookings"
  const [view, setView] = useState("shows");

  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [formError, setFormError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [shows, setShows] = useState([]);
  const [showsLoading, setShowsLoading] = useState(false);

  const [activeShow, setActiveShow] = useState(null);
  const [seats, setSeats] = useState([]);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [myHeldSeatIds, setMyHeldSeatIds] = useState([]);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  const [message, setMessage] = useState("");

  useEffect(() => {
    if (token) localStorage.setItem("bf_token", token);
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem("bf_user", JSON.stringify(user));
  }, [user]);

  const logout = () => {
    localStorage.removeItem("bf_token");
    localStorage.removeItem("bf_user");
    setToken("");
    setUser(null);
    setView("shows");
    setActiveShow(null);
    setMyHeldSeatIds([]);
  };

  // ---------- SHOWS ----------
  const loadShows = useCallback(async () => {
    setShowsLoading(true);
    try {
      const res = await fetch(`${API}/shows`);
      setShows(await res.json());
    } catch {
      setMessage("Could not reach the server. Is it running?");
    } finally {
      setShowsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) loadShows();
  }, [token, loadShows]);

  // ---------- SEATS ----------
  const loadSeats = useCallback(async (showId) => {
    setSeatsLoading(true);
    try {
      const res = await fetch(`${API}/shows/${showId}/seats`);
      setSeats(await res.json());
    } finally {
      setSeatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeShow || view !== "seats") return;
    loadSeats(activeShow._id);
    const interval = setInterval(() => loadSeats(activeShow._id), 3000);
    return () => clearInterval(interval);
  }, [activeShow, view, loadSeats]);

  // ---------- BOOKINGS ----------
  const loadBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const res = await fetch(`${API}/bookings/my`, { headers: authHeaders(token) });
      setBookings(await res.json());
    } finally {
      setBookingsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (view === "bookings") loadBookings();
  }, [view, loadBookings]);

  // ---------- AUTH ----------
  const validateForm = () => {
    if (mode === "signup" && form.name.trim().length < 2) {
      return "Name must be at least 2 characters.";
    }
    if (!EMAIL_RE.test(form.email)) {
      return "Enter a valid email address.";
    }
    if (form.password.length < 8) {
      return "Password must be at least 8 characters.";
    }
    return "";
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setFormError("");
    const err = validateForm();
    if (err) return setFormError(err);

    setAuthLoading(true);
    try {
      const res = await fetch(`${API}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Something went wrong");
        return;
      }
      setToken(data.token);
      setUser(data.user);
    } catch {
      setFormError("Could not reach the server. Is it running on localhost:5000?");
    } finally {
      setAuthLoading(false);
    }
  };

  // ---------- SEAT ACTIONS ----------
  const handleHold = async (seatId) => {
    setMessage("");
    const res = await fetch(`${API}/seats/${seatId}/hold`, {
      method: "POST",
      headers: authHeaders(token),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error);
    } else {
      setMyHeldSeatIds((prev) => [...prev, seatId]);
    }
    loadSeats(activeShow._id);
  };

  const handleRelease = async (seatId) => {
    await fetch(`${API}/seats/${seatId}/release`, {
      method: "POST",
      headers: authHeaders(token),
    });
    setMyHeldSeatIds((prev) => prev.filter((id) => id !== seatId));
    loadSeats(activeShow._id);
  };

  const handleConfirm = async () => {
    setMessage("");
    setConfirmLoading(true);
    try {
      const res = await fetch(`${API}/bookings/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ showId: activeShow._id, seatIds: myHeldSeatIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error);
      } else {
        setMessage(`Booking confirmed! Ref: ${data.transactionRef}`);
        setMyHeldSeatIds([]);
      }
      loadSeats(activeShow._id);
    } finally {
      setConfirmLoading(false);
    }
  };

  // ---------- RENDER: AUTH SCREEN ----------
  if (!token) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center justify-center font-sans px-4">

        {/* Logo + branding above card */}
        <div className="mb-6 flex flex-col items-center text-center">
          {/* Film-reel icon */}
          <div className="w-14 h-14 rounded-2xl bg-[#0d7561] flex items-center justify-center shadow-md mb-3">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">BookFlow</h1>
          <p className="mt-1 text-sm text-gray-500 max-w-xs leading-relaxed">
            Secure movie ticket booking powered by concurrency-safe reservations.
          </p>
        </div>

        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">

          {/* Tab switcher */}
          <div className="flex bg-gray-100 rounded-full p-1 mb-8">
            <button
              type="button"
              onClick={() => { setMode("login"); setFormError(""); }}
              className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                mode === "login"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setFormError(""); }}
              className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                mode === "signup"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleAuth} className="flex flex-col gap-5">

            {/* Name — signup only */}
            {mode === "signup" && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Full Name</label>
                <input
                  placeholder="Your name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#0d7561] focus:border-transparent transition"
                />
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                <input
                  placeholder="example@bookflow.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#0d7561] focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                {/* Lock icon — left */}
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 8 characters"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-10 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#0d7561] focus:border-transparent transition"
                />
                {/* Eye toggle — right */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    /* Eye-off */
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    /* Eye */
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                {formError}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-[#0d7561] hover:bg-[#0a5e4d] disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors duration-200"
            >
              {authLoading ? "Please wait…" : mode === "login" ? "Log In" : "Sign Up"}
            </button>
          </form>

          {/* Toggle link */}
          <p className="mt-6 text-center text-sm text-gray-600">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setFormError(""); }}
              className="text-[#0d7561] font-semibold hover:underline"
            >
              {mode === "login" ? "Sign Up" : "Log In"}
            </button>
          </p>

        </div>
      </div>
    );
  }


  // ---------- RENDER: NAV ----------
  const Nav = () => (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: "1px solid #ddd",
        fontFamily: "sans-serif",
      }}
    >
      <strong>BookFlow</strong>
      <button
        onClick={() => {
          setView("shows");
          setActiveShow(null);
        }}
        style={{ fontWeight: view === "shows" ? "bold" : "normal" }}
      >
        Shows
      </button>
      <button
        onClick={() => setView("bookings")}
        style={{ fontWeight: view === "bookings" ? "bold" : "normal" }}
      >
        My Bookings
      </button>
      <span style={{ marginLeft: "auto", color: "#666", fontSize: 13 }}>{user?.name || user?.email}</span>
      <button onClick={logout}>Log out</button>
    </div>
  );

  // ---------- RENDER: BOOKINGS ----------
  if (view === "bookings") {
    return (
      <div style={{ fontFamily: "sans-serif" }}>
        <Nav />
        <div style={{ maxWidth: 600, margin: "30px auto", padding: 20 }}>
          <h2>My Bookings</h2>
          {bookingsLoading && <p>Loading your bookings...</p>}
          {!bookingsLoading && bookings.length === 0 && (
            <p style={{ color: "#666" }}>No bookings yet — go grab a seat.</p>
          )}
          {bookings.map((b) => (
            <div key={b._id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{b.show?.title || "Show"}</strong>
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: b.paymentStatus === "success" ? "#e8f5e9" : "#ffebee",
                    color: b.paymentStatus === "success" ? "#2e7d32" : "#c62828",
                  }}
                >
                  {b.paymentStatus}
                </span>
              </div>
              <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                {b.show?.venue} — {b.show && formatDate(b.show.startTime)}
              </div>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                Seats: {b.seats?.map((s) => s.seatLabel).join(", ")}
              </div>
              <div style={{ marginTop: 4, fontWeight: "bold" }}>₹{b.amount}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- RENDER: SHOWS LIST ----------
  if (view === "shows" || !activeShow) {
    return (
      <div style={{ fontFamily: "sans-serif" }}>
        <Nav />
        <div style={{ maxWidth: 500, margin: "30px auto", padding: 20 }}>
          <h2>Shows</h2>
          {showsLoading && <p>Loading shows...</p>}
          {!showsLoading && shows.length === 0 && (
            <p style={{ color: "#666" }}>No shows yet — create one via POST /api/shows (see README).</p>
          )}
          {shows.map((s) => (
            <div
              key={s._id}
              style={{ border: "1px solid #ddd", padding: 12, marginBottom: 8, cursor: "pointer", borderRadius: 6 }}
              onClick={() => {
                setActiveShow(s);
                setView("seats");
              }}
            >
              <strong>{s.title}</strong> — {s.venue} — ₹{s.price}
              <div style={{ color: "#666", fontSize: 12 }}>{formatDate(s.startTime)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- RENDER: SEAT MAP ----------
  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: 700, margin: "30px auto", padding: 20 }}>
        <button onClick={() => setView("shows")}>&larr; Back to shows</button>
        <h2>{activeShow.title}</h2>
        {message && <p style={{ color: "#333", background: "#fffbcc", padding: 8, borderRadius: 4 }}>{message}</p>}

        {seatsLoading && seats.length === 0 ? (
          <p>Loading seat map...</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${activeShow.seatsPerRow}, 36px)`,
              gap: 6,
              margin: "20px 0",
            }}
          >
            {seats.map((seat) => {
              const mine = myHeldSeatIds.includes(seat._id);
              let bg = "#4caf50"; // free
              if (seat.status === "booked") bg = "#999";
              else if (seat.status === "held") bg = mine ? "#2196f3" : "#f44336";

              return (
                <div
                  key={seat._id}
                  onClick={() => {
                    if (seat.status === "free") handleHold(seat._id);
                    else if (mine) handleRelease(seat._id);
                  }}
                  title={seat.status}
                  style={{
                    background: bg,
                    color: "white",
                    fontSize: 11,
                    textAlign: "center",
                    lineHeight: "32px",
                    borderRadius: 4,
                    cursor: seat.status === "free" || mine ? "pointer" : "not-allowed",
                  }}
                >
                  {seat.seatLabel}
                </div>
              );
            })}
          </div>
        )}

        <p>
          <span style={{ color: "#4caf50" }}>■</span> Free &nbsp;
          <span style={{ color: "#2196f3" }}>■</span> Held by you &nbsp;
          <span style={{ color: "#f44336" }}>■</span> Held by others &nbsp;
          <span style={{ color: "#999" }}>■</span> Booked
        </p>

        {myHeldSeatIds.length > 0 && (
          <button onClick={handleConfirm} disabled={confirmLoading} style={{ padding: "10px 20px" }}>
            {confirmLoading
              ? "Processing payment..."
              : `Confirm & Pay for ${myHeldSeatIds.length} seat(s) — ₹${myHeldSeatIds.length * activeShow.price}`}
          </button>
        )}
      </div>
    </div>
  );
}
