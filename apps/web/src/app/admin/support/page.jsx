"use client";

import { useState, useEffect, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { MessageSquare, Clock, CheckCircle, AlertCircle } from "lucide-react";
import adminFetch from "@/utils/adminFetch";

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  // NEW: date credits grant UI for support tickets
  const [creditStatus, setCreditStatus] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [grantCredits, setGrantCredits] = useState("1");
  const [grantNote, setGrantNote] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState(null);
  const [grantSuccess, setGrantSuccess] = useState(null);

  const currentAdmin = JSON.parse(localStorage.getItem("admin") || "{}");

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const response = await adminFetch(
        `/api/admin/support-tickets?status=${statusFilter}`,
      );
      if (response.ok) {
        const data = await response.json();
        setTickets(data.tickets);
      }
    } catch (error) {
      console.error("Error loading tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (ticketId) => {
    try {
      const response = await adminFetch(
        `/api/admin/support-tickets/${ticketId}/messages`,
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const loadDateCredits = async (userId) => {
    const userIdNum = Number(userId);
    if (!Number.isFinite(userIdNum)) {
      setCreditStatus(null);
      return;
    }

    try {
      setCreditLoading(true);
      const resp = await adminFetch(
        `/api/admin/users/${userIdNum}/date-credits`,
      );
      if (!resp.ok) {
        const msg = await resp.json().catch(() => null);
        throw new Error(msg?.error || "Could not load date credits");
      }
      const data = await resp.json();
      setCreditStatus(data?.wallet || null);
    } catch (e) {
      console.error(e);
      setCreditStatus(null);
    } finally {
      setCreditLoading(false);
    }
  };

  const canGrantCredits = useMemo(() => {
    const userIdNum = Number(selectedTicket?.user_id);
    return Number.isFinite(userIdNum) && userIdNum > 0;
  }, [selectedTicket?.user_id]);

  useEffect(() => {
    // When opening a ticket, load credits if possible.
    if (!selectedTicket) return;
    setGrantError(null);
    setGrantSuccess(null);
    const uid = Number(selectedTicket?.user_id);
    if (Number.isFinite(uid) && uid > 0) {
      loadDateCredits(uid);
    } else {
      setCreditStatus(null);
    }
  }, [selectedTicket?.id]);

  const handleOpenTicket = async (ticket) => {
    setSelectedTicket(ticket);
    await loadMessages(ticket.id);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      const response = await adminFetch(
        `/api/admin/support-tickets/${selectedTicket.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: newMessage,
            senderType: "ADMIN",
            senderId: currentAdmin.id,
          }),
        },
      );

      if (response.ok) {
        setNewMessage("");
        await loadMessages(selectedTicket.id);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message");
    }
  };

  const handleGrantCredits = async () => {
    try {
      setGrantBusy(true);
      setGrantError(null);
      setGrantSuccess(null);

      const userIdNum = Number(selectedTicket?.user_id);
      const creditsNum = Number(grantCredits);

      if (!Number.isFinite(userIdNum) || userIdNum <= 0) {
        throw new Error("This ticket is not linked to a user.");
      }
      if (!Number.isFinite(creditsNum) || creditsNum <= 0) {
        throw new Error("Credits must be at least 1");
      }

      const resp = await adminFetch(
        `/api/admin/users/${userIdNum}/date-credits/grant`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credits: Math.round(creditsNum),
            supportTicketId: selectedTicket?.id,
            note: grantNote?.trim() || null,
          }),
        },
      );

      if (!resp.ok) {
        const msg = await resp.json().catch(() => null);
        throw new Error(msg?.error || "Could not grant credits");
      }

      setGrantSuccess("Credits granted.");
      await loadDateCredits(userIdNum);
    } catch (e) {
      console.error(e);
      setGrantError(e?.message || "Could not grant credits");
    } finally {
      setGrantBusy(false);
    }
  };

  const handleUpdateTicket = async (ticketId, updates) => {
    try {
      const response = await adminFetch("/api/admin/support-tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, ...updates }),
      });

      if (response.ok) {
        alert("Ticket updated successfully");
        loadTickets();
        setSelectedTicket(null);
      }
    } catch (error) {
      console.error("Error updating ticket:", error);
      alert("Failed to update ticket");
    }
  };

  const priorityColors = {
    URGENT: "bg-red-100 text-red-800",
    HIGH: "bg-orange-100 text-orange-800",
    MEDIUM: "bg-yellow-100 text-yellow-800",
    LOW: "bg-green-100 text-green-800",
  };

  return (
    <AdminLayout currentPage="support">
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Support Tickets
        </h1>

        {/* Status Filter */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-2 flex-wrap">
            {["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"].map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    statusFilter === status
                      ? "bg-[#FF1744] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {status.replace("_", " ")}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Tickets List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF1744]"></div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
              No tickets with status: {statusFilter}
            </div>
          ) : (
            tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${priorityColors[ticket.priority]}`}
                      >
                        {ticket.priority}
                      </span>
                      <span className="text-sm text-gray-600">
                        Ticket #{ticket.id}
                      </span>
                      {ticket.category && (
                        <span className="text-sm text-gray-600">
                          • {ticket.category}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {ticket.subject}
                    </h3>
                    <p className="text-gray-700 mb-2 line-clamp-2">
                      {ticket.description}
                    </p>
                    <div className="text-sm text-gray-600">
                      <span>From: {ticket.user_email || "Anonymous"}</span>
                      <span className="mx-2">•</span>
                      <span>
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </span>
                      {ticket.assigned_to_email && (
                        <>
                          <span className="mx-2">•</span>
                          <span>Assigned to: {ticket.assigned_to_email}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenTicket(ticket)}
                    className="ml-4 px-4 py-2 bg-[#FF1744] text-white rounded-lg hover:bg-[#D50032] transition-colors text-sm whitespace-nowrap"
                  >
                    Open Ticket
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedTicket.subject}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Ticket #{selectedTicket.id} •{" "}
                    {selectedTicket.user_email || "Anonymous"}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2">
                <select
                  value={selectedTicket.status}
                  onChange={(e) =>
                    handleUpdateTicket(selectedTicket.id, {
                      status: e.target.value,
                    })
                  }
                  className="text-sm border border-gray-300 rounded px-3 py-1"
                >
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="WAITING_USER">Waiting User</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>

                <select
                  value={selectedTicket.priority}
                  onChange={(e) =>
                    handleUpdateTicket(selectedTicket.id, {
                      priority: e.target.value,
                    })
                  }
                  className="text-sm border border-gray-300 rounded px-3 py-1"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              {/* NEW: Date credits grant */}
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      Date credits
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {creditLoading
                        ? "Loading…"
                        : creditStatus
                          ? `Current: ${creditStatus.credits} credits (${creditStatus.balanceCents} cents)`
                          : canGrantCredits
                            ? "Could not load"
                            : "Ticket not linked to a user"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      value={grantCredits}
                      onChange={(e) => setGrantCredits(e.target.value)}
                      disabled={!canGrantCredits || grantBusy}
                      className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      placeholder="1"
                    />
                    <div className="text-sm text-gray-700">credits</div>
                    <button
                      onClick={handleGrantCredits}
                      disabled={!canGrantCredits || grantBusy}
                      className="px-4 py-2 rounded-lg bg-[#FF1744] text-white text-sm font-semibold disabled:opacity-60"
                    >
                      {grantBusy ? "Granting…" : "Grant"}
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    value={grantNote}
                    onChange={(e) => setGrantNote(e.target.value)}
                    disabled={!canGrantCredits || grantBusy}
                    placeholder="Note (optional)"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                {grantError ? (
                  <div className="mt-2 text-sm text-red-600">{grantError}</div>
                ) : null}
                {grantSuccess ? (
                  <div className="mt-2 text-sm text-green-700">
                    {grantSuccess}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Initial Description */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-2">
                  {selectedTicket.user_email || "Anonymous"} •{" "}
                  {new Date(selectedTicket.created_at).toLocaleDateString()}
                </div>
                <p className="text-gray-900">{selectedTicket.description}</p>
              </div>

              {/* Message Thread */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg p-4 ${
                    msg.sender_type === "ADMIN"
                      ? "bg-blue-50 ml-8"
                      : "bg-gray-50 mr-8"
                  }`}
                >
                  <div className="text-sm text-gray-600 mb-2">
                    {msg.sender_email} ({msg.sender_type}) •{" "}
                    {new Date(msg.created_at).toLocaleString()}
                  </div>
                  <p className="text-gray-900">{msg.message}</p>
                </div>
              ))}
            </div>

            {/* Reply Form */}
            <form
              onSubmit={handleSendMessage}
              className="p-6 border-t border-gray-200"
            >
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your reply..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent mb-3"
                rows="3"
              />
              <button
                type="submit"
                className="px-6 py-2 bg-[#FF1744] text-white rounded-lg hover:bg-[#D50032] transition-colors"
              >
                Send Reply
              </button>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
