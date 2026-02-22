import { useState } from "react";
import { Plus, X } from "lucide-react";

export function InterestsSection({ interests, onAdd, onRemove }) {
  const [interestInput, setInterestInput] = useState("");

  const handleAdd = () => {
    onAdd(interestInput);
    setInterestInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Interests</h2>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <input
          value={interestInput}
          onChange={(e) => setInterestInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="Type an interest and press Enter"
        />
        <button
          onClick={handleAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Plus size={18} />
          Add
        </button>
      </div>

      {interests.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {interests.map((it) => (
            <span
              key={it}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-sm"
            >
              {it}
              <button
                onClick={() => onRemove(it)}
                className="text-gray-600 hover:text-gray-900"
                title="Remove"
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
