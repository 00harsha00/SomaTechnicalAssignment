"use client";
import { Todo, TodoDependency } from '@prisma/client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import Graph from 'graphology';
import { topologicalSort, hasCycle } from 'graphology-dag';

export default function Home() {
  const [newTodo, setNewTodo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dependencies, setDependencies] = useState<number[]>([]);
  const [todos, setTodos] = useState<(Todo & { myDependencies: TodoDependency[]; dependsOnMe: TodoDependency[] })[]>([]);
  const [imageLoading, setImageLoading] = useState<Record<number, boolean>>({});
  const [graph, setGraph] = useState(new Graph({ type: 'directed' }));

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const res = await fetch('/api/todos');
      const data = await res.json();
      setTodos(data);
      const g = new Graph({ type: 'directed' });
      data.forEach((todo: Todo & { myDependencies: TodoDependency[]; dependsOnMe: TodoDependency[] }) => {
        g.addNode(todo.id.toString());
        todo.myDependencies.forEach((dep) => {
          if (data.find((t: Todo & { myDependencies: TodoDependency[]; dependsOnMe: TodoDependency[] }) => t.id === dep.dependsOnId)) {
            g.addEdge(dep.dependsOnId.toString(), todo.id.toString());
          }
        });
      });
      setGraph(g);
    } catch (error) {
      console.error('Failed to fetch todos:', error);
    }
  };

  const handleAddTodo = async () => {
    if (!newTodo.trim() || !dueDate) return;
    const tempGraph = graph.copy();
    tempGraph.addNode('new');
    dependencies.forEach(depId => tempGraph.addEdge(depId.toString(), 'new'));
    if (hasCycle(tempGraph)) {
      alert('Circular dependency detected.');
      return;
    }

    setImageLoading(prev => ({ ...prev, [Date.now()]: true }));
    let imageUrl = '';
    try {
      const res = await axios.get('https://api.pexels.com/v1/search', {
        headers: { Authorization: process.env.NEXT_PUBLIC_PEXELS_API_KEY },
        params: { query: newTodo, per_page: 1 },
      });
      imageUrl = res.data.photos[0]?.src.medium || '';
    } catch (error) {
      console.error('Pexels API error:', error);
    }
    setImageLoading(prev => ({ ...prev, [Date.now()]: false }));

    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTodo, dueDate, dependencies, imageUrl }),
      });
      if (!res.ok) throw new Error('Failed to create todo');
      setNewTodo('');
      setDueDate('');
      setDependencies([]);
      fetchTodos();
    } catch (error) {
      console.error('Failed to add todo:', error);
    }
  };

  const handleDeleteTodo = async (id: number) => {
    try {
      await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
      });
      fetchTodos();
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const calculateCriticalPath = () => {
    const sorted = topologicalSort(graph).map(id => parseInt(id));
    const earliestStart: Record<string, number> = {};
    sorted.forEach((node: string) => {
      earliestStart[node] = 0;
      graph.forEachInEdge(node, (_, __, source) => {
        const sourceTodo = todos.find((t: Todo & { myDependencies: TodoDependency[]; dependsOnMe: TodoDependency[] }) => t.id === parseInt(source));
        earliestStart[node] = Math.max(earliestStart[node], sourceTodo?.dueDate ? new Date(sourceTodo.dueDate).getTime() : 0);
      });
    });
    return { sorted, earliestStart };
  };

  const { sorted, earliestStart } = calculateCriticalPath();

  const renderDependencyGraph = () => {
    const nodes = graph.nodes().map((node, i) => ({
      id: node,
      x: 50 + (i % 5) * 100,
      y: 50 + Math.floor(i / 5) * 100,
    }));
    const edges = graph.edges().map(edge => ({
      source: nodes.find(n => n.id === graph.source(edge)),
      target: nodes.find(n => n.id === graph.target(edge)),
    }));
    return (
      <svg width="600" height="400" className="mt-4">
        {edges.map((edge, i) => (
          <line
            key={i}
            x1={edge.source.x}
            y1={edge.source.y}
            x2={edge.target.x}
            y2={edge.target.y}
            stroke="black"
            strokeWidth="2"
          />
        ))}
        {nodes.map(node => (
          <g key={node.id}>
            <circle
              cx={node.x}
              cy={node.y}
              r="20"
              fill="lightblue"
              stroke="black"
              strokeWidth="1"
            />
            <text x={node.x} y={node.y + 5} textAnchor="middle" className="text-sm">
              {node.id}
            </text>
          </g>
        ))}
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-500 to-red-500 flex flex-col items-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold text-center text-white mb-8">Things To Do App</h1>
        <div className="flex mb-6">
          <input
            type="text"
            className="flex-grow p-3 rounded-l-full focus:outline-none text-gray-700"
            placeholder="Add a new todo"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
          />
          <input
            type="datetime-local"
            className="p-3 border-l border-gray-300 focus:outline-none text-gray-700"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <select
            multiple
            value={dependencies}
            onChange={(e) =>
              setDependencies(Array.from(e.target.selectedOptions, option => parseInt(option.value)))
            }
            className="p-3 border-l border-gray-300 focus:outline-none text-gray-700"
          >
            {todos.map((todo) => (
              <option key={todo.id} value={todo.id}>
                {todo.title}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddTodo}
            className="bg-white text-indigo-600 p-3 rounded-r-full hover:bg-gray-100 transition duration-300"
          >
            Add
          </button>
        </div>
        <ul>
          {todos.map((todo) => (
            <li
              key={todo.id}
              className="flex justify-between items-center bg-white bg-opacity-90 p-4 mb-4 rounded-lg shadow-lg"
            >
              <div>
                <span className="text-gray-800">{todo.title}</span>
                {todo.dueDate && (
                  <span
                    className={`ml-4 ${
                      todo.dueDate && new Date(todo.dueDate) < new Date()
                        ? 'text-red-500'
                        : 'text-gray-600'
                    }`}
                  >
                    Due: {new Date(todo.dueDate).toLocaleString()}
                  </span>
                )}
                {imageLoading[todo.id] ? (
                  <span className="ml-4 text-yellow-500">Loading image...</span>
                ) : todo.imageUrl ? (
                  <img src={todo.imageUrl} alt={todo.title} className="ml-4 w-16 h-16 object-cover rounded" />
                ) : null}
                <div className="ml-4 text-gray-600">
                  Dependencies: {todo.myDependencies.map(dep => dep.dependsOn.title).join(', ') || 'None'}
                </div>
                <div className="ml-4 text-gray-600">
                  Depended on by: {todo.dependsOnMe.map(dep => dep.todo.title).join(', ') || 'None'}
                </div>
                {todo.dueDate && (
                  <div className="ml-4 text-gray-600">
                    Earliest Start: {new Date(earliestStart[todo.id.toString()] || 0).toLocaleString()}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDeleteTodo(todo.id)}
                className="text-red-500 hover:text-red-700 transition duration-300"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <h2 className="text-2xl font-bold text-white mb-2">Critical Path</h2>
          <p className="text-white">{sorted.join(' -> ')}</p>
          <h2 className="text-2xl font-bold text-white mt-4 mb-2">Dependency Graph</h2>
          {renderDependencyGraph()}
        </div>
      </div>
    </div>
  );
}