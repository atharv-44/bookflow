import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SOCKET_URL = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";
const socket = io(SOCKET_URL);
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
    
    // Real-time Socket.IO setup
    socket.emit("join_show", activeShow._id);
    
    const onSeatsUpdated = () => loadSeats(activeShow._id);
    socket.on("seats_updated", onSeatsUpdated);
    
    return () => {
      socket.off("seats_updated", onSeatsUpdated);
    };
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

    // Cold-start warning: Render free tier spins down after inactivity.
    // If the first request takes >8s, show an honest message so users
    // don't think the site is broken while the backend wakes up.
    const slowTimer = setTimeout(() => {
      setFormError("The server is waking up (this can take ~30s on the free tier) — please wait…");
    }, 8000);

    try {
      const res = await fetch(`${API}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      clearTimeout(slowTimer);
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Something went wrong");
        return;
      }
      setFormError("");
      setToken(data.token);
      setUser(data.user);
    } catch {
      clearTimeout(slowTimer);
      setFormError("Could not reach the server. Please try again in a moment.");
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
    <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between font-sans">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[#0d7561] flex items-center justify-center shadow-sm">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </div>
        <span className="font-bold text-[#0d7561] text-xl tracking-tight">BookFlow</span>
      </div>
      
      {/* Right Section */}
      <div className="flex items-center gap-6">
        {/* Nav links */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => { setView("shows"); setActiveShow(null); }}
            className={`text-sm font-semibold pb-1 transition-colors border-b-2 ${
              view === "shows"
                ? "text-[#0d7561] border-[#0d7561]"
                : "text-gray-500 border-transparent hover:text-gray-800"
            }`}
          >
            Shows
          </button>
          <button
            onClick={() => setView("bookings")}
            className={`text-sm font-semibold pb-1 transition-colors border-b-2 ${
              view === "bookings"
                ? "text-[#0d7561] border-[#0d7561]"
                : "text-gray-500 border-transparent hover:text-gray-800"
            }`}
          >
            My Bookings
          </button>
          {user?.role === "admin" && (
            <button
              onClick={() => setView("admin")}
              className={`text-sm font-semibold pb-1 transition-colors border-b-2 ${
                view === "admin"
                  ? "text-[#0d7561] border-[#0d7561]"
                  : "text-gray-500 border-transparent hover:text-gray-800"
              }`}
            >
              Admin Dashboard
            </button>
          )}
        </div>
        
        {/* Separator */}
        <div className="hidden sm:block w-px h-6 bg-gray-200"></div>
        
        {/* Spacer + user + logout */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#e6f4f1] text-[#0d7561] flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">{user?.name || user?.email}</span>
          </div>
          <button
            onClick={logout}
            className="text-sm font-medium text-gray-600 bg-gray-100 px-4 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  );

  // ---------- RENDER: ADMIN DASHBOARD ----------
  if (view === "admin") {
    if (user?.role !== "admin") {
      setView("shows");
      return null;
    }

    const handleCreateShow = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      setShowsLoading(true);
      try {
        const res = await fetch(`${API}/shows`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(token) },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          setMessage("Show created successfully!");
          e.target.reset();
          loadShows();
        } else if (res.status === 403) {
          setMessage("⚠️ Your admin access has been revoked — please log out and log in again.");
        } else {
          const err = await res.json();
          setMessage(err.error || "Failed to create show");
        }
      } finally {
        setShowsLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-[#f8f9fa] font-sans">
        <Nav />
        <div className="max-w-2xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Create New Show</h3>
            <form onSubmit={handleCreateShow} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input name="title" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#0d7561] focus:border-[#0d7561] outline-none" placeholder="e.g. Inception" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
                <input name="venue" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#0d7561] focus:border-[#0d7561] outline-none" placeholder="e.g. Cinema 1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input name="startTime" type="datetime-local" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#0d7561] focus:border-[#0d7561] outline-none" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rows</label>
                  <input name="rows" type="number" defaultValue="5" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#0d7561] focus:border-[#0d7561] outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seats/Row</label>
                  <input name="seatsPerRow" type="number" defaultValue="8" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#0d7561] focus:border-[#0d7561] outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price (₹)</label>
                  <input name="price" type="number" defaultValue="200" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#0d7561] focus:border-[#0d7561] outline-none" />
                </div>
              </div>
              <button type="submit" disabled={showsLoading} className="mt-2 bg-[#0d7561] text-white py-2 rounded-lg font-medium hover:bg-[#0a5e4d] transition-colors disabled:opacity-50">
                {showsLoading ? "Creating..." : "Create Show"}
              </button>
            </form>
          </div>

          {message && (
            <div className={`mt-4 border text-sm rounded-xl px-4 py-3 ${
              message.startsWith("⚠️")
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-green-50 border-green-200 text-green-800"
            }`}>
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- RENDER: BOOKINGS ----------
  if (view === "bookings") {
    return (
      <div className="min-h-screen bg-[#f0f2f5] font-sans">
        <Nav />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">My Bookings</h2>

          {bookingsLoading && (
            <p className="text-gray-500 text-sm">Loading your bookings...</p>
          )}

          {!bookingsLoading && bookings.length === 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
              </svg>
              <p className="text-gray-500 text-sm">No bookings yet — go grab a seat.</p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {bookings.map((b) => (
              <div key={b._id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-semibold text-gray-900 text-base">{b.show?.title || "Show"}</p>
                  <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                    b.paymentStatus === "success"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}>
                    {b.paymentStatus === "success" ? "Confirmed" : "Failed"}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {b.show?.venue} &mdash; {b.show && formatDate(b.show.startTime)}
                </p>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Seats:</span> {b.seats?.map((s) => s.seatLabel).join(", ")}
                  </p>
                  <p className="text-base font-bold text-[#0d7561]">₹{b.amount}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- RENDER: SHOWS LIST ----------
  if (view === "shows" || !activeShow) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] font-sans pb-12">
        <Nav />
        <div className="max-w-7xl mx-auto px-6 py-12">
          
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">Now Showing</h1>
            <p className="text-gray-500 max-w-2xl text-base leading-relaxed">
              Discover the latest cinematic masterpieces and live performances. Premium seating, seamless booking.
            </p>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button className="bg-[#0d7561] text-white px-5 py-2 rounded-full text-sm font-semibold shadow-sm">All Categories</button>
              <button className="bg-gray-100 text-gray-700 px-5 py-2 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors">Sci-Fi</button>
              <button className="bg-gray-100 text-gray-700 px-5 py-2 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors">Drama</button>
              <button className="bg-gray-100 text-gray-700 px-5 py-2 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors">Action</button>
              <button className="bg-gray-100 text-gray-700 px-5 py-2 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors">Live Concerts</button>
            </div>
            <div className="relative w-full md:w-72">
              <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              </span>
              <input type="text" placeholder="Search shows..." className="w-full border border-gray-300 rounded-full pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#0d7561] focus:border-transparent transition shadow-sm" />
            </div>
          </div>

          {showsLoading && (
            <p className="text-gray-500 text-sm">Loading shows...</p>
          )}

          {!showsLoading && shows.length === 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
              <p className="text-gray-500 text-sm">No shows yet — create one via POST /api/shows (see README).</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {shows.map((s, idx) => (
              <div
                key={s._id}
                onClick={() => { setActiveShow(s); setView("seats"); }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col"
              >
                {/* Image Area */}
                <div className="relative h-80 w-full bg-gray-100 overflow-hidden">
                  {/* Using a predictable random image from Picsum based on show ID */}
                  <img src={`https://picsum.photos/seed/${s._id}/400/600`} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
                  <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-gray-800 flex items-center gap-1 shadow-sm">
                    <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    4.9
                  </div>
                </div>
                
                {/* Details Area */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-[#0d7561] transition-colors line-clamp-1">{s.title}</h3>
                    <span className="font-bold text-[#0d7561] shrink-0">₹{s.price}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-5">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                    <span className="line-clamp-1">{s.venue}</span>
                  </div>
                  
                  <div className="mt-auto pt-4 border-t border-gray-100 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Next Show</p>
                      <p className="text-sm font-semibold text-gray-800">{formatDate(s.startTime)}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-[#0d7561] text-white flex items-center justify-center shrink-0 group-hover:bg-[#0a5e4d] transition-colors shadow-sm">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" /></svg>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 text-center">
            <button className="bg-[#e6f4f1] text-[#0d7561] font-semibold px-8 py-3 rounded-xl hover:bg-[#d5ebe5] transition-colors">
              Load More Shows
            </button>
          </div>

          {/* Footer */}
          <footer className="mt-20 pt-8 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
            <div>
              <span className="font-bold text-[#0d7561]">BookFlow</span> &copy; 2024 BookFlow. All rights reserved.
            </div>
            <div className="flex flex-wrap justify-center gap-6">
              <a href="#" className="hover:text-gray-900 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-gray-900 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-gray-900 transition-colors">Help Center</a>
              <a href="#" className="hover:text-gray-900 transition-colors">Contact Us</a>
            </div>
          </footer>

        </div>
      </div>
    );
  }

  // ---------- RENDER: SEAT MAP ----------
  return (
    <div className="min-h-screen bg-[#f0f2f5] font-sans">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Back + title */}
        <button
          onClick={() => setView("shows")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0d7561] transition-colors mb-5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to shows
        </button>

        <div className="mb-2">
          <h2 className="text-2xl font-bold text-gray-900">{activeShow.title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{activeShow.venue} &mdash; {formatDate(activeShow.startTime)}</p>
        </div>

        {/* Flash message */}
        {message && (
          <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
            {message}
          </div>
        )}

        {/* Seat grid card */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

          {/* Screen indicator */}
          <div className="mb-6 text-center">
            <div className="h-2 bg-gray-200 rounded-full w-3/4 mx-auto mb-1" />
            <p className="text-xs text-gray-400 uppercase tracking-widest">Screen</p>
          </div>

          {seatsLoading && seats.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Loading seat map...</p>
          ) : (
            <div
              style={{ gridTemplateColumns: `repeat(${activeShow.seatsPerRow}, minmax(0, 1fr))` }}
              className="grid gap-1.5"
            >
              {seats.map((seat) => {
                const mine = myHeldSeatIds.includes(seat._id);
                let cls = "bg-[#0d7561] hover:bg-[#0a5e4d] cursor-pointer"; // free
                if (seat.status === "booked") cls = "bg-gray-300 cursor-not-allowed";
                else if (seat.status === "held") cls = mine
                  ? "bg-blue-500 hover:bg-blue-600 cursor-pointer ring-2 ring-blue-300"
                  : "bg-red-400 cursor-not-allowed";

                return (
                  <div
                    key={seat._id}
                    onClick={() => {
                      if (seat.status === "free") handleHold(seat._id);
                      else if (mine) handleRelease(seat._id);
                    }}
                    title={seat.status}
                    className={`${cls} text-white text-[10px] font-medium text-center py-1.5 rounded transition-colors select-none`}
                  >
                    {seat.seatLabel}
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#0d7561] inline-block" /> Free</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Held by you</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> Held by others</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-300 inline-block" /> Booked</span>
          </div>
        </div>

        {/* Confirm & Pay */}
        {myHeldSeatIds.length > 0 && (
          <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">{myHeldSeatIds.length} seat{myHeldSeatIds.length > 1 ? "s" : ""} selected</p>
              <p className="text-sm text-gray-500">Total: <span className="font-bold text-[#0d7561]">₹{myHeldSeatIds.length * activeShow.price}</span></p>
            </div>
            <button
              onClick={handleConfirm}
              disabled={confirmLoading}
              className="bg-[#0d7561] hover:bg-[#0a5e4d] disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              {confirmLoading ? "Processing..." : "Confirm & Pay"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
