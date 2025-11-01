import React, { useState } from 'react';
import { Upload, Settings, Music, PlayCircle, FileAudio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';

const ConfigPage = () => {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [karaokeMode, setKaraokeMode] = useState(true);
  const [singingMode, setSingingMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file.name);
    }
  };

  const handleProcessAudio = async () => {
    setIsProcessing(true);
    // Simulate processing
    setTimeout(() => {
      setIsProcessing(false);
      navigate('/player');
    }, 2000);
  };

  const handleViewLibrary = () => {
    navigate('/player');
  };

  return (
    <div className="cosmic-bg min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-primary-gradient rounded-xl flex items-center justify-center shadow-glow">
              <Music className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="mobile-title bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Babelback
            </h1>
          </div>
          <p className="mobile-text text-muted-foreground mb-6">
            Upload audio, play, and explore lyrics in sync.
          </p>
        </div>

        {/* Navigation Tabs */}
        <Tabs defaultValue="main" className="mb-8">
          <TabsList className="grid w-full grid-cols-4 glass-card">
            <TabsTrigger value="main" className="data-[state=active]:bg-primary-gradient">
              Main App
            </TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="tech">Tech Details</TabsTrigger>
            <TabsTrigger value="changelog">Changelog</TabsTrigger>
          </TabsList>

          <TabsContent value="main" className="space-y-6 animate-fade-in">
            {/* Library Access */}
            <div className="text-center">
              <Button 
                onClick={handleViewLibrary}
                className="bg-primary-gradient hover:shadow-glow gap-2 rounded-xl px-8 py-3"
              >
                <PlayCircle className="h-5 w-5" />
                View My Song Library (7)
              </Button>
            </div>

            {/* Configuration Cards */}
            <div className="grid gap-6">
              {/* Audio Settings */}
              <Card className="glass-card p-6">
                <h3 className="section-header flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Show Audio Settings
                </h3>
                
                <div className="space-y-6">
                  {/* AI Model Selection */}
                  <div>
                    <label className="block text-sm font-medium mb-3 text-foreground/90">
                      AI Model for Processing
                    </label>
                    <Select defaultValue="gemini">
                      <SelectTrigger className="glass-card border-border/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-card border-border/30">
                        <SelectItem value="gemini">Gemini 2.5 Pro</SelectItem>
                        <SelectItem value="gpt4">GPT-4</SelectItem>
                        <SelectItem value="claude">Claude 3</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-2">
                      Highest quality audio model transcribing. Changing this model will re-process the current song if new or loaded (e.g. when you restart screen or re-upload).
                    </p>
                  </div>

                  {/* File Upload */}
                  <div>
                    <label className="block text-sm font-medium mb-3 text-foreground/90">
                      Upload Audio File
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={handleFileUpload}
                          className="hidden"
                          id="audio-upload"
                        />
                        <label
                          htmlFor="audio-upload"
                          className="glass-card border border-border/30 rounded-lg p-4 cursor-pointer hover:bg-muted/20 transition-colors flex items-center gap-3 w-full"
                        >
                          <FileAudio className="h-5 w-5 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {selectedFile || 'Choose audio file...'}
                          </span>
                        </label>
                      </div>
                      <Button
                        onClick={handleProcessAudio}
                        disabled={!selectedFile || isProcessing}
                        className="bg-accent-gradient hover:shadow-glow gap-2 rounded-xl"
                      >
                        <Upload className="h-4 w-4" />
                        {isProcessing ? 'Processing...' : 'Process Audio'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Babelback will attempt to transcribe lyrics and arrange from your audio. Results may vary based on audio quality and lyrical clarity.
                    </p>
                  </div>

                  {/* Translation Settings */}
                  <div>
                    <label className="block text-sm font-medium mb-3 text-foreground/90">
                      Translate to:
                    </label>
                    <Select defaultValue="english">
                      <SelectTrigger className="glass-card border-border/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-card border-border/30">
                        <SelectItem value="english">🇬🇧 English</SelectItem>
                        <SelectItem value="spanish">🇪🇸 Spanish</SelectItem>
                        <SelectItem value="french">🇫🇷 French</SelectItem>
                        <SelectItem value="hindi">🇮🇳 Hindi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Mode Toggles */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                      <div>
                        <h4 className="font-medium text-foreground">Karaoke Mode</h4>
                        <p className="text-sm text-muted-foreground">Synchronized instrumentals word-by-word.</p>
                      </div>
                      <Switch
                        checked={karaokeMode}
                        onCheckedChange={setKaraokeMode}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                      <div>
                        <h4 className="font-medium text-foreground">Singing Practice Mode</h4>
                        <p className="text-sm text-muted-foreground">Practice vocals and get AI feedback.</p>
                      </div>
                      <Switch
                        checked={singingMode}
                        onCheckedChange={setSingingMode}
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Song Preview */}
              <Card className="glass-card p-6">
                <div className="text-center mb-4">
                  <h3 className="text-xl font-bold text-primary mb-2">
                    Waka Waka (Esto es África)
                  </h3>
                  <Badge variant="secondary" className="bg-accent-gradient text-accent-foreground">
                    (Original Lyrics: Spanish)
                  </Badge>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-accent font-semibold mb-2">Song Summary</h4>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      This song is a superb upbeat and motivational anthem made for the 2010 FIFA World Cup in South Africa. It's all about unity, 
                      resilience, and celebrating the spirit of Africa, encouraging everyone to overcome challenges and give it their all.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-accent font-semibold mb-2">Detailed Song Analysis</h4>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      This track, performed by Shakira, became the official song for the 2010 FIFA World Cup and is one of the best-selling singles of 
                      all time. The lyrics are incredibly uplifting, using the metaphor of a battle or a game to talk about facing life's challenges. It tells 
                      you to get up when you fall, to find the support of your people, and to strive for victory. What makes it so unique is the chorus, 
                      which borrows from a 1986 Cameroonian song 'Zamangalewa' by the group Golden Sounds. The phrases 'Tsamina mina' and 
                      'Zangalewa' are from the Fang language of Cameroon. 'Waka waka' itself means 'do it' in Duala. This blend of Spanish lyrics with 
                      an African chant captures the blended global nature of the World Cup being held in Africa for the first time. It's a 
                      celebration of both competition and cultural unity.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="about" className="animate-fade-in">
            <Card className="glass-card p-8 text-center">
              <h3 className="text-2xl font-bold mb-4 text-primary">About Babelback</h3>
              <p className="text-foreground/80 leading-relaxed max-w-2xl mx-auto">
                Babelback is an AI-powered lyrics exploration platform that helps you understand and appreciate music from around the world. 
                Upload any song and get synchronized lyrics, translations, cultural context, and detailed analysis.
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="tech" className="animate-fade-in">
            <Card className="glass-card p-8">
              <h3 className="text-2xl font-bold mb-6 text-accent">Technical Details</h3>
              <div className="grid gap-4">
                <div className="p-4 bg-muted/10 rounded-lg">
                  <h4 className="font-semibold mb-2">AI Models</h4>
                  <p className="text-sm text-muted-foreground">Gemini 2.5 Pro for transcription and analysis</p>
                </div>
                <div className="p-4 bg-muted/10 rounded-lg">
                  <h4 className="font-semibold mb-2">Audio Processing</h4>
                  <p className="text-sm text-muted-foreground">Advanced audio analysis and synchronization</p>
                </div>
                <div className="p-4 bg-muted/10 rounded-lg">
                  <h4 className="font-semibold mb-2">Languages</h4>
                  <p className="text-sm text-muted-foreground">Support for 50+ languages with translation</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="changelog" className="animate-fade-in">
            <Card className="glass-card p-8">
              <h3 className="text-2xl font-bold mb-6 text-primary">Changelog</h3>
              <div className="space-y-4">
                <div className="border-l-4 border-primary pl-4">
                  <h4 className="font-semibold">v2.1.0 - Latest</h4>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li>• Added Karaoke Mode</li>
                    <li>• Improved AI transcription accuracy</li>
                    <li>• New mobile-first interface</li>
                  </ul>
                </div>
                <div className="border-l-4 border-accent pl-4">
                  <h4 className="font-semibold">v2.0.0</h4>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li>• Complete UI redesign</li>
                    <li>• Added Singing Practice Mode</li>
                    <li>• Multi-language support</li>
                  </ul>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ConfigPage;