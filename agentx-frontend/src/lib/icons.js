import {
  Network, ListTree, Search, BarChart3, TerminalSquare, PenLine, ShieldCheck,
  TrendingUp, Swords, BookOpen, Sparkles, Globe, Database, Boxes, Layers, HardDrive,
  MessageSquare, Github, Mail,
} from 'lucide-react';

const MAP = {
  Network, ListTree, Search, BarChart3, TerminalSquare, PenLine, ShieldCheck,
  TrendingUp, Swords, BookOpen, Sparkles, Globe, Database, Boxes, Layers, HardDrive,
  MessageSquare, Github, Mail,
};

export const iconFor = (name) => MAP[name] || Sparkles;
