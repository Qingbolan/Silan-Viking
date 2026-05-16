"""CLI application business logic"""

from pathlib import Path
from typing import Dict, Any, Optional

from ..utils import ModernLogger
from ..cli.status import execute_status_command
from ..cli.db_sync_command import execute_db_sync_command

class SilanCLILogger(ModernLogger):
    """Specialized logger for CLI application"""
    
    def __init__(self):
        super().__init__(name="silan_cli", level="info")
    
    def app_start(self, version: str) -> None:
        """Log application start"""
        self.banner("SILAN", "Silan Database Tools", f"Version {version} - Sync markdown content to databases with ease")
    
    def command_start(self, command: str) -> None:
        """Log command execution start"""
        self.stage(f"Executing command: {command}")
    
    def command_success(self, command: str) -> None:
        """Log successful command execution"""
        self.success(f"✅ Command '{command}' completed successfully")
    
    def command_error(self, command: str, error: str) -> None:
        """Log command execution error"""
        self.error(f"❌ Command '{command}' failed: {error}")
    
    def show_help(self, available_commands: list) -> None:
        """Show available commands"""
        self.section("Available Commands")
        for cmd in available_commands:
            self.print(f"  • [bold cyan]{cmd}[/bold cyan]")


class CLILogic(SilanCLILogger):
    """Main CLI application logic"""
    
    def __init__(self):
        super().__init__()
        self.project_dir = Path.cwd()
        self.version = "1.0.0"
        
        # Available commands mapping
        self.commands = {
            'init': self._handle_init,
            'db-sync': self._handle_db_sync,
            'db-config': self._handle_db_config,
            'backend': self._handle_backend,
            'frontend': self._handle_frontend,
            'new': self._handle_new,
            'status': self._handle_status,
            'help': self._handle_help,
            'edit': self._handle_edit,
            'append': self._handle_append,
            'write': self._handle_write,
            'ls': self._handle_ls,
            'show': self._handle_show,
            'search': self._handle_search,
            'skill': self._handle_skill
        }
    
    def run_application(self, ctx, verbose: bool = False) -> None:
        """Run the main CLI application"""
        try:
            if verbose:
                self.debug("Verbose mode enabled")
            
            self.app_start(self.version)
            
        except Exception as e:
            self.error(f"Application initialization failed: {e}")
            raise
    
    def execute_command(self, command: str, **kwargs) -> bool:
        """Execute a specific command"""
        try:
            self.command_start(command)
            
            if command not in self.commands:
                self.error(f"Unknown command: {command}")
                self._handle_help()
                return False
            
            # Execute command handler
            success = self.commands[command](**kwargs)
            
            if success:
                self.command_success(command)
            else:
                self.command_error(command, "Command execution failed")
            
            return success
            
        except Exception as e:
            self.command_error(command, str(e))
            self.exception(f"Unexpected error in command '{command}'")
            return False
    
    def _handle_init(self, project_name: str, language: str = 'en', with_backend: bool = False, **kwargs) -> bool:
        """Handle init command"""
        from .project_init_logic import ProjectInitLogic
        
        logic = ProjectInitLogic(project_name, language, with_backend)
        
        if not logic.validate_project_setup():
            return False
        
        logic.show_initialization_plan()
        return logic.execute_initialization()
    
    def _handle_db_sync(self, db_type: Optional[str] = None, host: str = 'localhost', 
                       port: Optional[int] = None, user: Optional[str] = None,
                       password: Optional[str] = None, database: Optional[str] = None,
                       db_path: str = 'portfolio.db', dry_run: bool = False,
                       create_tables: bool = False, start_backend: bool = False,
                       use_cache: bool = True, **kwargs) -> bool:
        """Handle db-sync command"""
        from ..utils import ConfigManager
        
        config_manager = ConfigManager(self.project_dir)
        
        # Determine database configuration
        any_db_param_provided = any([db_type, user, password, database, 
                                   host != 'localhost', port, db_path != 'portfolio.db'])
        
        if use_cache and not any_db_param_provided:
            db_config = config_manager.get_smart_db_config()
            if not db_config or not db_config.get('type'):
                self.warning("No previous database configuration found")
                self.info("Please run 'silan db-config interactive' or specify database parameters")
                return False
        else:
            # Build config from parameters
            db_config = self._build_db_config(db_type, host, port, user, password, database, db_path)
            config_manager.update_db_cache(db_config)
        
        # Save sync options
        sync_options = {
            'dry_run': dry_run,
            'create_tables': create_tables,
            'start_backend': start_backend
        }
        config_manager.save_last_sync_config(db_config, sync_options)
        
        # Execute sync through shared pipeline implementation
        success = execute_db_sync_command(
            db_config,
            dry_run=dry_run,
            create_tables=create_tables,
            start_backend=start_backend,
            logger=self,
        )

        if start_backend and success and not dry_run:
            return self._start_backend_after_sync(db_config)

        return success
    
    def _handle_db_config(self, action: str = 'show', **params) -> bool:
        """Handle db-config command"""
        from .database_config_logic import DatabaseConfigLogic
        
        config_logic = DatabaseConfigLogic()
        
        if not config_logic.validate_action_params(action, params):
            return False
        
        if action == 'show':
            return config_logic.show_current_config()
        elif action == 'set':
            return config_logic.set_database_config(params)
        elif action == 'interactive':
            return config_logic.interactive_config_setup()
        elif action == 'cache':
            return config_logic.cache_current_config()
        elif action == 'load-cache':
            return config_logic.load_cached_config()
        elif action == 'clear-cache':
            return config_logic.clear_cached_config()
        elif action == 'last-sync':
            return config_logic.show_last_sync_config()
        elif action == 'clear-all':
            return config_logic.clear_all_configs()
        else:
            self.error(f"Unknown db-config action: {action}")
            return False
    
    def _handle_backend(self, action: str, **config) -> bool:
        """Handle backend command"""
        from .backend_logic import BackendLogic
        
        backend_logic = BackendLogic()
        
        if not backend_logic.validate_action_config(action, config):
            return False
        
        if action == 'start':
            return backend_logic.start_backend(config)
        elif action == 'stop':
            return backend_logic.stop_backend()
        elif action == 'restart':
            return backend_logic.restart_backend(config)
        elif action == 'status':
            return backend_logic.show_backend_status()
        elif action == 'logs':
            return backend_logic.show_backend_logs(
                follow=config.get('follow', False),
                lines=config.get('lines', 50)
            )
        elif action == 'install':
            return backend_logic.install_backend()
        else:
            self.error(f"Unknown backend action: {action}")
            return False

    def _handle_new(self, content_type: str, name: str, title: str = None, description: str = None,
                   category: str = None, tags: list = None, language: str = 'en',
                   status: str = None, sub_type: str = None, **kwargs) -> bool:
        """Handle new content creation command"""
        from .content_scaffold_logic import ContentScaffoldLogic, IdeaOptions, ProjectOptions

        try:
            scaffold_logic = ContentScaffoldLogic()

            # Set defaults based on content type
            if not title:
                title = name.replace('-', ' ').replace('_', ' ').title()

            # Create content based on type
            if content_type == 'idea':
                options = IdeaOptions(
                    description=description,
                    category=category,
                    tags=tags or [],
                    research_field=category
                )
                result = scaffold_logic.create_idea(title, options)
                self.success(f"✅ Created idea: {result}")
                return True

            elif content_type == 'project':
                options = ProjectOptions(
                    description=description,
                    category=category,
                    tags=tags or [],
                    status=status or 'active',
                    license='MIT'
                )
                result = scaffold_logic.create_project(name, options)
                self.success(f"✅ Created project: {result}")
                return True

            else:
                # For other content types, we'll implement simple template creation
                return self._create_simple_template(content_type, name, title, description,
                                                  category, tags, language, status, sub_type)

        except Exception as e:
            self.error(f"❌ Error creating {content_type}: {e}")
            return False

    def _create_simple_template(self, content_type: str, name: str, title: str,
                               description: str, category: str, tags: list,
                               language: str, status: str, sub_type: str) -> bool:
        """Create simple template for content types not handled by scaffold logic"""
        from pathlib import Path
        import yaml
        from datetime import datetime

        content_dir = Path.cwd() / "content" / content_type
        content_dir.mkdir(parents=True, exist_ok=True)

        # Create templates based on content type
        if content_type == 'blog':
            item_dir = content_dir / name
            item_dir.mkdir(exist_ok=True)

            # Create .silan-cache for blog
            config_data = {
                'sync_metadata': {
                    'item_id': name,
                    'content_type': 'blog_post',
                    'sync_enabled': True
                },
                'series_info': {
                    'series_id': name,
                    'title': title,
                    'description': description,
                    'category': category or 'general',
                    'content_type': sub_type or 'article'
                },
                'content_files': [
                    {
                        'file_id': 'en',
                        'language': 'en',
                        'file_path': 'en.md',
                        'is_primary': True
                    }
                ]
            }

            config_file = item_dir / '.silan-cache'
            with open(config_file, 'w') as f:
                yaml.dump(config_data, f, default_flow_style=False)

            # Create content file
            frontmatter = {
                'title': title,
                'author': 'Author Name',
                'date': datetime.now().strftime('%Y-%m-%d'),
                'type': sub_type or 'article',
                'excerpt': description or f'Brief description of {title}',
                'tags': tags or [],
                'status': status or 'draft',
                'language': 'en'
            }

            content_file = item_dir / 'en.md'
            with open(content_file, 'w') as f:
                f.write('---\n')
                yaml.dump(frontmatter, f, default_flow_style=False)
                f.write('---\n\n')
                f.write(f'# {title}\n\n')
                f.write(f'{description or "Add your content here..."}\n\n')
                f.write('## Introduction\n\n')
                f.write('Write your introduction here.\n\n')
                f.write('## Main Content\n\n')
                f.write('Add your main content here.\n\n')
                f.write('## Conclusion\n\n')
                f.write('Summarize your content here.\n')

            self.success(f"✅ Created blog post: {item_dir}")
            return True

        elif content_type == 'episode':
            series_dir = content_dir / name
            series_dir.mkdir(exist_ok=True)

            # Create series config
            config_data = {
                'sync_metadata': {
                    'item_id': name,
                    'content_type': 'episode_series',
                    'sync_enabled': True
                },
                'series_info': {
                    'series_id': name,
                    'title': title,
                    'description': description,
                    'category': category or 'tutorial'
                },
                'episodes': []
            }

            config_file = series_dir / '.silan-cache'
            with open(config_file, 'w') as f:
                yaml.dump(config_data, f, default_flow_style=False)

            self.success(f"✅ Created episode series: {series_dir}")
            return True

        elif content_type == 'resume':
            # Create resume files
            resume_file = content_dir / 'resume.md'

            frontmatter = {
                'title': 'Professional Resume',
                'name': 'Your Name',
                'email': 'your.email@example.com',
                'phone': '+1 (xxx) xxx-xxxx',
                'location': 'Your Location',
                'language': language
            }

            with open(resume_file, 'w') as f:
                f.write('---\n')
                yaml.dump(frontmatter, f, default_flow_style=False)
                f.write('---\n\n')
                f.write('# Your Name\n\n')
                f.write('## Contact Information\n\n')
                f.write('- Email: your.email@example.com\n')
                f.write('- Phone: +1 (xxx) xxx-xxxx\n')
                f.write('- Location: Your Location\n\n')
                f.write('## Professional Summary\n\n')
                f.write('Add your professional summary here.\n\n')
                f.write('## Experience\n\n')
                f.write('### Job Title - Company Name\n')
                f.write('*Date Range*\n\n')
                f.write('- Achievement or responsibility\n')
                f.write('- Another achievement or responsibility\n\n')
                f.write('## Education\n\n')
                f.write('### Degree - Institution\n')
                f.write('*Date Range*\n\n')
                f.write('## Skills\n\n')
                f.write('- Skill 1\n')
                f.write('- Skill 2\n')
                f.write('- Skill 3\n')

            self.success(f"✅ Created resume: {resume_file}")
            return True

        else:
            self.error(f"Template creation for {content_type} not implemented")
            return False

    def _handle_status(self, **kwargs) -> bool:
        """Handle status command"""
        return execute_status_command(self)
    
    def _handle_help(self, topic: Optional[str] = None, **kwargs) -> bool:
        """Handle help command"""
        from .help_logic import HelpLogic
        help_logic = HelpLogic()

        if topic:
            return help_logic.show_topic_help(topic)
        else:
            return help_logic.show_general_help()

    def _handle_edit(self, file_path: Optional[str] = None, content_type: Optional[str] = None,
                    item_name: Optional[str] = None, file_type: str = 'readme',
                    editor: Optional[str] = None, **kwargs) -> bool:
        """Handle edit command"""
        from .file_edit_logic import FileEditLogic

        edit_logic = FileEditLogic()

        # If file_path is provided, open it directly
        if file_path:
            return edit_logic.open_file_in_editor(file_path, editor)

        # If content_type and item_name are provided, edit specific content file
        elif content_type and item_name:
            return edit_logic.edit_content_file(content_type, item_name, file_type, editor)

        else:
            self.error("Please provide either --file or both --type and --name")
            return False

    def _handle_append(self, file_path: str, content: str,
                      timestamp: bool = False, separator: bool = False, **kwargs) -> bool:
        """Handle append command"""
        from .file_edit_logic import FileEditLogic

        edit_logic = FileEditLogic()
        return edit_logic.append_to_file(file_path, content, timestamp, separator)

    def _handle_write(self, content_type: str, item_name: str, file_type: str,
                     content: str, mode: str = 'append', **kwargs) -> bool:
        """Handle write command"""
        from .file_edit_logic import FileEditLogic

        edit_logic = FileEditLogic()
        return edit_logic.quick_write_to_content(content_type, item_name, file_type, content, mode)

    def _handle_ls(self, content_type: Optional[str] = None, detailed: bool = False,
                  show_files: bool = False, **kwargs) -> bool:
        """Handle ls command"""
        from .list_content_logic import ContentListLogic

        list_logic = ContentListLogic()
        return list_logic.list_content(content_type, detailed, show_files)

    def _handle_show(self, content_type: str, item_name: str,
                    show_files: bool = True, show_metadata: bool = True, **kwargs) -> bool:
        """Handle show command"""
        from .list_content_logic import ContentListLogic

        list_logic = ContentListLogic()
        return list_logic.show_content_details(content_type, item_name, show_files, show_metadata)

    def _handle_search(self, query: str, content_type: Optional[str] = None,
                      search_in: str = 'title', **kwargs) -> bool:
        """Handle search command"""
        from .list_content_logic import ContentListLogic

        list_logic = ContentListLogic()
        return list_logic.search_content(query, content_type, search_in)
    
    def _handle_skill(self, action: str = 'install', name: Optional[str] = None,
                     project: bool = False, force: bool = False, **kwargs) -> bool:
        """Handle skill command"""
        from ..cli.skill_command import execute_skill_command

        return execute_skill_command(
            action=action, name=name, project=project, force=force
        )

    def _build_db_config(self, db_type: Optional[str], host: str, port: Optional[int],
                        user: Optional[str], password: Optional[str], 
                        database: Optional[str], db_path: str) -> Dict[str, Any]:
        """Build database configuration from parameters"""
        if not db_type:
            db_type = 'sqlite'
        
        if db_type in ['mysql', 'postgresql']:
            if port is None:
                port = 3306 if db_type == 'mysql' else 5432
            
            return {
                'type': db_type,
                'host': host,
                'port': port,
                'user': user or 'root' if db_type == 'mysql' else 'postgres',
                'password': password or '',
                'database': database or 'silan_portfolio'
            }
        else:
            return {
                'type': 'sqlite',
                'path': db_path
            }
    
    def _start_backend_after_sync(self, db_config: Dict[str, Any]) -> bool:
        """Start backend server after successful sync"""
        try:
            from .backend_logic import BackendLogic
            
            self.info("🚀 Starting backend server after sync...")
            
            backend_config = {
                'database': db_config,
                'server': {'host': '0.0.0.0', 'port': 5200},
                'daemon': False
            }
            
            backend_logic = BackendLogic()
            return backend_logic.start_backend(backend_config)
            
        except Exception as e:
            self.error(f"Failed to start backend after sync: {e}")
            return False

    def _handle_frontend(self, action: str, **config) -> bool:
        """Handle frontend command"""
        from .frontend_logic import FrontendLogic

        frontend_logic = FrontendLogic()

        if action == 'install':
            return frontend_logic.install_frontend(
                dev_mode=config.get('dev_mode', False),
                target_dir=config.get('target_dir')
            )
        else:
            self.error(f"Unknown frontend action: {action}")
            return False
