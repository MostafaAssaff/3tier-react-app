// ===================================================================
// Jenkinsfile (Final & Comprehensive Version)
// This declarative pipeline automates the entire CI/CD process:
// SonarQube -> Trivy Scan -> Docker Build/Push -> Helm Deploy
// ===================================================================

pipeline {
    // 1. Agent Configuration
    // Run this pipeline on any available agent.
    agent any

    // 2. Tools
    // Tells Jenkins to find the 'SonarScanner-latest' tool (configured in Global Tools)
    // and add it to the PATH for the pipeline.
    tools {
        'hudson.plugins.sonar.SonarRunnerInstallation' 'SonarScanner-latest'
    }

    // 3. Environment Variables
    // Define all necessary variables here for easy management.
    environment {
        AWS_REGION         = 'us-west-2'
        ECR_REGISTRY       = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME      = 'my-app-repo'
        EKS_CLUSTER_NAME   = 'my-eks-cluster'
        
        // These will use the credentials securely stored in Jenkins.
        SONAR_CREDENTIALS  = credentials('sonar-token')
        AWS_CREDENTIALS_ID = 'aws-credentials' 
    }

    // 4. Pipeline Stages
    stages {
        
        // ==========================================================
        // Stage 1: Checkout Code
        // ==========================================================
        stage('Checkout') {
            steps {
                echo "🔄 Checking out code from branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        // ==========================================================
        // Stage 2: SonarQube Quality Check
        // ==========================================================
        stage('SonarQube Analysis') {
            steps {
                // Ensure your SonarQube server is configured in Manage Jenkins -> System Configuration
                withSonarQubeEnv('MySonarQubeServer') { 
                    // This command will look for a 'sonar-project.properties' file in your repo root.
                    sh 'sonar-scanner'
                }
            }
        }
        
        // ==========================================================
        // Stage 3: Wait for Quality Gate
        // This crucial stage pauses the pipeline and fails it if the SonarQube Quality Gate does not pass.
        // ==========================================================
        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    // abortPipeline: true will automatically fail the build if the gate status is not 'OK'.
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        // ==========================================================
        // Stage 4: Build, Scan & Push Application Images
        // This stage builds both frontend and backend images in parallel to save time.
        // ==========================================================
        stage('Build, Scan & Push Images') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('backend') { // Work inside the 'backend' directory
                            script {
                                // Use BUILD_ID to create a unique tag for each build, essential for versioning.
                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-backend-${env.BUILD_ID}"
                                
                                echo "Building Backend image: ${imageName}"
                                def backendImage = docker.build(imageName, '.')

                                echo "Scanning Backend image with Trivy for vulnerabilities..."
                                // Fail the build if any high or critical vulnerabilities are found.
                                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"

                                // Login to ECR using the configured credentials and push the image.
                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    echo "Pushing Backend image to ECR..."
                                    backendImage.push()
                                }
                            }
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('frontend') { // Work inside the 'frontend' directory
                            script {
                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-frontend-${env.BUILD_ID}"
                                
                                echo "Building Frontend image: ${imageName}"
                                def frontendImage = docker.build(imageName, '.')

                                echo "Scanning Frontend image with Trivy for vulnerabilities..."
                                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"
                                
                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    echo "Pushing Frontend image to ECR..."
                                    frontendImage.push()
                                }
                            }
                        }
                    }
                }
            }
        }

        // ==========================================================
        // Stage 5: Deploy to EKS using Helm
        // ==========================================================
        stage('Deploy to EKS') {
            steps {
                script {
                    // Use the withAWS block to automatically handle authentication for AWS CLI commands.
                    withAWS(credentials: AWS_CREDENTIALS_ID, region: env.AWS_REGION) {
                        
                        echo "Configuring kubectl for EKS cluster: ${EKS_CLUSTER_NAME}"
                        // Use '--alias' to create a robust kubeconfig context that avoids auth issues.
                        sh "aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${env.AWS_REGION} --alias ${EKS_CLUSTER_NAME}"

                        echo "Deploying application with Helm..."
                        // This command is idempotent: it upgrades the release if it exists, or installs it if it doesn't.
                        // We pass the unique image tags to the Helm chart using --set.
                        // This assumes you have a Helm chart in a './helm/my-app' directory in your repo.
                        sh """
                            helm upgrade --install my-app ./helm/my-app \
                                --namespace default \
                                --set backend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} \
                                --set backend.image.tag=3tier-nodejs-backend-${env.BUILD_ID} \
                                --set frontend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} \
                                --set frontend.image.tag=3tier-nodejs-frontend-${env.BUILD_ID}
                        """
                    }
                }
            }
        }
    }
    
    // 5. Post-build Actions
    // These actions run at the end of the pipeline, regardless of the outcome.
    post {
        always {
            script {
                echo "Pipeline finished. Cleaning up workspace."
                cleanWs()
            }
        }
        success {
            echo "✅ Build and deploy successful!"
        }
        failure {
            echo "❌ Build failed."
        }
    }
}
