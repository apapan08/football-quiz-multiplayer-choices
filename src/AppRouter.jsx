// src/AppRouter.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import Lobby from './pages/Lobby.jsx';
import PlayRoom from './pages/PlayRoom.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Join from './pages/Join.jsx';
import QuizPrototype from './App.jsx'; // existing single-player

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/room/:code" element={<Lobby />} />
        <Route path="/play/:code" element={<PlayRoom />} />
        <Route path="/room/:code/leaderboard" element={<Leaderboard />} />
        <Route path="/solo" element={<QuizPrototype />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
